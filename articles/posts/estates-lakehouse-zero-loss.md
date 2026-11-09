---
title: "Proving zero loss: count reconciliation for a bronze/silver lakehouse"
date: 2026-11-08
summary: "How a small bronze/silver lakehouse proves that no row goes missing between raw export and clean table: count reconciliation per source, at the right grain, with every rejected row kept in quarantine. Portfolio project, synthetic data."
tags: [Lakehouse, Data Quality, Python]
draft: false
---

This is a portfolio project, and every row in it is synthetic. The inputs come from `campus_synth`, a generator I wrote that produces deliberately messy campus estates exports (merged Excel title rows, mixed date formats, duplicate rows, stuck sensors) along with a known ground truth. No real client, building or person is involved. The question I wanted the lakehouse to answer is simple: can I prove that every raw row either reached the clean layer or was put aside with a reason, so none were silently dropped?

## The problem

Estates data shows up as a pile of unrelated extracts. In this project there are eight: a space register (multi-sheet XLSX), CAFM work orders, two suppliers' half-hourly meter files (one long, one wide), BMS trend logs (wide), statutory inspections (XLSX), a timetable, and 15-minute occupancy sensors (Parquet).

Each one breaks in its own way. Dates come as `dd/mm/yyyy`, ISO strings or Excel serials. Meter data is in UK local time, so the clocks-change days have 46 or 50 half-hours instead of 48. Building names don't match between systems. A normal cleaning script deals with all this by filtering, and filtering is where rows vanish. If a dashboard total later looks wrong, nobody can say whether the source was short or the pipeline lost something.

So I set myself one rule for P01: every row has to be accounted for, and a test has to show it.

## Architecture

The design is a two-layer medallion with a quarantine next to silver:

```text
data/raw/*  (xlsx / csv / parquet, local time)
    |
    |  load_bronze(): sha256 the file; skip if already loaded
    v
bronze/<source>/ingest_date=YYYY-MM-DD/*.parquet
    all columns as strings + _ingest_id, _source_system, _source_file,
    _loaded_at, _row_number, _row_hash
    |
    |  silver_<source>.py: parse, type, UTC, dedupe, map refs
    +----------------------------+
    v                            v
silver/<source>/silver.parquet   quarantine/<source>/quarantine.parquet
typed, UTC, deduped              original values + _reject_reason
    |
    v
reconciliation.json   raw == bronze  AND  silver + quarantine == bronze
    |
    v
DuckDB queries, dbt gold marts (P04)
```

Bronze never changes a value. It reads everything as text, adds six audit columns and writes Parquet partitioned by ingest date. Silver handles the typing. Any row that fails a rule is moved into quarantine with a reason string, never deleted. Storage is local, MinIO or S3 behind one `STORAGE` switch, and Terraform for an S3/Glue/Athena deployment is in the repo, ready for a first apply.

## Decision 1: quarantine, not filter

Silver code is only allowed to drop a row by moving it to quarantine. All the transforms share one helper:

```python
def quarantine(df, mask, reason):
    """Split valid/quarantine. Quarantine gets _reject_reason; valid drops the mask."""
    m = mask.fillna(False).to_numpy(dtype=bool)
    q = df[m].copy()
    q["_reject_reason"] = reason
    return df[~m].copy(), q
```

Duplicates go through the same path (`duplicate:meter_id+local_time`, for example), and so do nulls, unparseable or future dates, negative readings, unmapped categories and buildings (with rapidfuzz suggestions at a score of 60 or more), orphan references, and work orders whose completion date is on or before the raised date.

The trade-off is that you end up with two tables per source instead of one, and quarantine is stored as strings because rows rejected at different stages carry different types. What you get back is that the loss check comes down to addition. It also gave me a rule for dates: an ambiguous or nonexistent London local time becomes `NaT` and goes to quarantine. I never guess which side of the clock change a reading belonged to.

## Decision 2: reconcile at the grain the data actually has

The check itself is short:

```python
def reconcile_counts(raw, bronze, silver, quarantine, grain="row"):
    ok_raw = raw == bronze
    ok_sq = silver + quarantine == bronze
    return {..., "unexplained": bronze - silver - quarantine,
            "pass": bool(ok_raw and ok_sq)}
```

"Raw" means counting the source file independently of the loader. For CSV that's data lines minus the header. For XLSX it's rows per sheet minus three for the space register (two merged title rows and a header) and minus one for the others. For Parquet it's `len()`.

That works until a source changes shape. Supplier B's meter file has one row per meter per day with columns `HH01`, `HH02` and so on, and silver unpivots it to one row per half-hour. Comparing rows there would always fail. So for the two wide sources (supplier B and BMS trends) the check compares cells: bronze rows times value columns against silver plus quarantine rows.

That's a real trade-off. A cell-level check is only as good as the code that counts the cells, and I come back to that below.

## Decision 3: idempotency by file hash

`load_bronze` hashes each raw file with SHA-256 and checks it against a bronze manifest. If the same source and hash are already there, the file is skipped and nothing new is written. A corrected file has a new hash, so it gets a new `_ingest_id`. Without this, running the ingest twice would double bronze, and the raw-equals-bronze check would fail for a reason that has nothing to do with data quality. The cost is that bronze state is cumulative. Whatever sits in the bronze folder counts toward the totals, and that turned out to matter.

## Results

The acceptance run on 4 October 2026 (small profile, seed 42, recorded in `docs/ACCEPTANCE_P01.md`) produced this `reconciliation.json`, with every source at `pass: true`:

| Source | Grain | Raw | Bronze | Silver | Quarantine |
|---|---|---:|---:|---:|---:|
| space_register | row | 501 | 501 | 495 | 6 |
| cafm_workorders | row | 6,039 | 6,039 | 4,171 | 1,868 |
| meter_hh_supplierA | row | 34,419 | 34,419 | 33,866 | 553 |
| meter_hh_supplierB | cell | 732 rows | 35,136 cells | 34,349 | 787 |
| bms_trends | cell | 8,640 rows | 172,800 cells | 172,780 | 20 |
| statutory_inspections | row | 41 | 41 | 40 | 1 |
| timetable | row | 12,566 | 12,566 | 12,347 | 219 |
| sensors | row | 779,933 | 779,933 | 773,974 | 5,959 |

That's eight out of eight with zero unexplained rows or cells. The ingest took 34–35 seconds. A second `run-all` reported all eight bronze files as `skipped` and the silver counts didn't change. On the clocks-change day, 2026-03-29, each meter produced 46 unique UTC periods. The platform tests (7 of them) cover bronze idempotency, silver rules, cumulative-register rollover, DST, reconciliation, and a check that planted invalid rows land in quarantine with a reason.

Strictly, this proves that nothing went missing. It does not prove the rows are correct. Correctness is handled downstream: P03 runs 133 YAML data-quality checks against the planted ground truth, and P04 reconciles silver to the dbt marts. In the P04 acceptance doc, for example, space went 495 to 495, and meter half-hours went 68,119 to 67,822 (Δ −297, the defect meters).

!!! note "A later run, and what it taught the check"
    A later run on 17 October showed **6/8**. Both failures trace back to the check, not to lost data.

    `meter_hh_supplierA`: raw 34,419 vs bronze 34,420. Bronze also contains a one-row `_corrupt` file left over from the P02 schema-drift demo (P02 is the Airflow orchestration project in the same portfolio), and that file isn't in `data/raw`. Silver plus quarantine still equals bronze (33,866 + 554).

    `bms_trends`: a second BMS file (288 rows, 294 points, exported by P15, the portfolio's IoT sensor project) now sits next to the original (8,640 rows, 20 points). The counter concatenates the two bronze frames and multiplies all 8,928 rows by the 314 point columns in the union, which gives 2,803,392 "cells" when most of them never existed. The real total is 8,640 × 20 + 288 × 294 = 257,472, which is exactly silver plus quarantine (257,215 + 257).

So the headline holds for the acceptance run, and the later run showed two things to harden: count cells per bronze file rather than over the union of columns, and reconcile against the bronze manifest rather than whatever the folder contains.

Today `ingest.cli reconcile` writes and prints the JSON and exits 0, and the data-quality gate after it is what fails builds. Making reconciliation a gate of its own is the first next step.

## What I'd do next

- **Make reconciliation a gate.** Exit non-zero when any source has `pass: false`, and add a CI step that asserts on `reconciliation.json` rather than just generating it.
- **Reconcile per file.** Count value cells for each bronze file before concatenating, and key the check on the bronze manifest (file, sha256, rows), so a new wide schema or a stray demo file shows up as its own line.
- **Add a hash-level check.** Bronze already stores a `_row_hash`. The next step is to carry it into silver and quarantine, so each source row can be traced to exactly one destination row. Counts can balance even when one row is lost and another is duplicated. Hashes can't.
- **Replace the truth-based crosswalk.** The building crosswalk reads the generator's truth table at ingest. A real deployment would read a master-data table instead.

The full project, including the dbt marts, data-quality framework and the other demos, is on the [Estates Data Portfolio case page](../projects/estates-data-platform.html), and the code is on [GitHub](https://github.com/Eng-Zakaria/estates-data-portfolio).
