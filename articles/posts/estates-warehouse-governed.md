---
title: "Modeling estates data to Uniclass, COBie and SFG20"
date: 2026-11-08
summary: "How I built a small estates warehouse that checks asset data against Uniclass, COBie and SFG20 rules before it loads, and where those checks stop short of the real standards."
tags: [Data Modeling, Data Warehousing, SQL]
draft: false
sources:
  - Workspace/digital-estates-platform/README.md
  - Workspace/digital-estates-platform/docs/data_dictionary.md
  - Workspace/digital-estates-platform/docs/lineage.md
  - Workspace/digital-estates-platform/docs/netzero_method.md
  - Workspace/digital-estates-platform/sql/schema.sql
  - Workspace/digital-estates-platform/generators/generate_synthetic.py
  - Workspace/digital-estates-platform/generators/generate_surveys.py
  - Workspace/digital-estates-platform/ingest/bronze_ingest.py
  - Workspace/digital-estates-platform/validate/checks.py
  - Workspace/digital-estates-platform/transform/build_silver_gold.py
  - Workspace/digital-estates-platform/analytics/netzero.py
  - Workspace/digital-estates-platform/dags/estates_daily.py
  - Workspace/digital-estates-platform/tests/test_checks.py
  - Workspace/digital-estates-platform/powerbi/measures.dax
  - Workspace/digital-estates-platform/powerbi/pages_spec.md
  - Workspace/digital-estates-platform/data/warehouse/estates.db
  - Profile/Portfolio/projects/digital-estates.html
---

This is a portfolio project, and every row in it is synthetic. Two seeded Python scripts generate the buildings, rooms, assets, handover records, work orders and meter readings. No real estate or university data is involved. What I wanted to work through was a modeling question: if the people sending you facilities data are expected to follow industry standards, how much of that can a pipeline actually enforce, and what should it do with the rows that don't comply?

## The problem

An estates team (the people who run a campus's buildings) gets data from several systems that were never designed to agree with each other:

- an **asset register**, listing every boiler, air handling unit and fire detector;
- a **space register**, listing rooms and what they are used for;
- **COBie** sheets, delivered by contractors when a building is handed over;
- **CAFM** work orders (Computer-Aided Facilities Management, the ticketing system for maintenance jobs);
- **BMS** extracts (Building Management System, the meter and sensor feed).

Three UK standards come up again and again in this world. Here is a short version for data engineers:

| Standard | What it is | Data-engineering analogy |
|---|---|---|
| Uniclass 2015 | A hierarchical classification of construction things. Codes look like `Ss_32_12_20`, where `Ss` is the Systems table. | A controlled taxonomy key, like a product category code |
| COBie | A spreadsheet schema for handing over building data (Type, Component, serial number and so on) at the end of a project, used for ISO 19650 information handover | A data contract between the contractor and the owner |
| SFG20 | The industry library of planned maintenance schedules: which task, how often, for which kind of asset | A reference table of SLAs per asset class |

I also used HESA EMR space categories. HESA is the UK higher-education statistics agency, and its Estate Management Record is the annual return universities file about their buildings.

The failure mode is easy to describe. One bad classification code or an incomplete handover row gets into the warehouse, and every dashboard measure that groups by it quietly goes wrong.

## Architecture

The repo is plain Python, pandas and SQLite. An optional Airflow DAG wraps the same three steps.

```text
generators/generate_synthetic.py  ─┐   9 raw CSVs (seeded, random.seed(42) / seed(7))
generators/generate_surveys.py    ─┘
            │
            ▼
ingest/bronze_ingest.py      + ingestion_timestamp, batch_id, source_file
            │
            ▼
validate/checks.py           Uniclass regex · SFG20 present · COBie mandatory
            │                HESA whitelist · orphan keys · range checks
      ┌─────┴──────┐
      ▼            ▼
data/silver/   data/quarantine/*.csv
      │
      ▼
transform/build_silver_gold.py + sql/schema.sql
      │
      ▼
estates.db   3 dims + 5 facts + ref_cobie + 6 views ──► Power BI spec (9 pages, 10 DAX measures)
      │
      ▼
analytics/netzero.py         HDD baseline, BMS anomalies, fault → SFG20 asset
```

The Airflow DAG `estates_daily` runs `bronze_ingest >> validate_quarantine >> build_warehouse` on `@daily`. The net zero analytics script is a separate manual step.

The warehouse has `dim_building`, `dim_space` and `dim_asset`, plus five facts: `fact_workorder`, `fact_energy`, `fact_space_use`, `fact_condition` and `fact_compliance`. `ref_cobie` holds the handover components. Six views sit on top for reporting: EMR summary, open compliance work, energy intensity, space utilisation, compliance RAG and backlog.

## How the standards are actually used

I want to be exact here, because "modeled to Uniclass, COBie and SFG20" can mean much more than this project does.

**Uniclass** is a column on `dim_asset` and on the COBie components. The pipeline checks the shape of the code with a regex. Nothing more.

```python
UNICLASS_RE = re.compile(r"^Ss_\d{2}_\d{2}_\d{2}(-\d+)?$")

m = assets["uniclass"].str.match(UNICLASS_RE)
bad_uni = assets[~m]
if len(bad_uni):
    bad_uni = bad_uni.copy(); bad_uni["quarantine_reason"] = "bad_uniclass:" + bad_uni["uniclass"]
    bad_uni.to_csv(QUAR / "assets_bad_uniclass.csv", index=False)
```

The repo has no Uniclass lookup table. A code like `Ss_99_99_99` would pass, because it has the right shape even though it isn't a real entry. Only the Systems (`Ss`) table is accepted. The generator draws from five fixed sample codes, and I haven't checked them against the published Uniclass tables.

**COBie** is treated as a completeness contract. A component row must have `cobie_type`, `component_id` and `serial_number` filled in, and a well-formed Uniclass code. Passing rows go to `ref_cobie`, which keeps `asset_id` but isn't declared as a foreign key in the schema. The project ingests one flat Component-style CSV, not a full COBie workbook with its Facility, Floor, Space, Type and Component sheets.

**SFG20** is the thinnest of the three. `dim_asset.sfg20_schedule` is a text column with values like `AHU-01` or `LIFT-03`, and the only rule is that it isn't empty:

```python
m &= assets["sfg20_schedule"].str.len() > 0
```

These are invented identifiers, not real SFG20 schedule references. The repo stores no task frequencies and computes no due dates from SFG20. The column is used downstream: `vw_compliance_open` groups open work orders by it, and the anomaly script lists the SFG20 schedule of each suspect HVAC asset. In practice it works as a label, not a reference to a maintenance regime.

**HESA** space types are a whitelist in Python, `{"OFF", "LAB", "LEC", "LIB", "STO"}`. In `schema.sql` the column is just `TEXT NOT NULL`, with no CHECK constraint.

## Decision 1: quarantine, don't crash

`validate/checks.py` always exits 0. Each rule splits a table into a pass set, which goes to `data/silver/`, and a fail set, which goes to `data/quarantine/`. The warehouse is built only from silver.

I chose this because in estates data a broken row is usually a conversation with a contractor, not a bug. Stopping the whole daily load because 8 assets have a bad code would hold back 107 good ones. The rejected rows stay as CSVs that someone can send back.

The trade-off is that a pipeline that never fails can hide a bad day. Nothing in the repo alerts when the quarantine count jumps, and the Power BI spec only plans a "quarantined rows by batch_id" trend after two or more runs. I also found a bug while writing this. The two dedicated asset files (`assets_bad_uniclass.csv`, `assets_orphan_space.csv`) fill in `quarantine_reason`, but the generic `*_fails.csv` files written by `_split()` leave that column empty, because the code writes a placeholder:

```python
fails[reason_col] = fails.get(reason_col, "")  # placeholder
```

So `cobie_components_fails.csv` tells you which rows failed but not why.

## Decision 2: validate in dependency order

Rules run in key order: spaces first, then assets against *surviving* spaces, then work orders against *surviving* assets.

```python
asset_ids = set(assets_ok["asset_id"])
m = wo["asset_id"].isin(asset_ids) & (pd.to_numeric(wo["cost_gbp"], errors="coerce").fillna(-1) >= 0)
```

This means the star schema can't contain a work order pointing at a quarantined asset, so joins in Power BI won't drop rows silently. The cost is that rejections cascade. One bad asset takes all its work orders with it. In this run, 13 assets were quarantined and 13 work orders followed them. Losing the asset is the right result. Losing the maintenance history may not be, and a real team would probably want those work orders held, not dropped.

## Decision 3: SQLite and a flat star, not a full BIM model

I loaded into SQLite with a hand-written `schema.sql`, and the comment says it is "SQLite + Postgres compatible". Standards codes are plain attributes on `dim_asset`, not dimensions of their own. That keeps the model small enough to open in DB Browser or connect to Power BI over ODBC, and it means everything runs on a laptop.

The trade-offs are real:

- There is no `dim_uniclass` or `dim_sfg20`, so there are no descriptions, no hierarchy roll-up (system → subgroup → object) and no maintenance frequencies to report against.
- There is no date dimension. Dates are text columns, and `vw_energy_intensity` takes the day with `substr(e.timestamp, 1, 10)`.
- SQLite doesn't enforce the `REFERENCES` clauses unless foreign keys are turned on, and the build script doesn't turn them on. Integrity rests on the Python checks.

The views use correlated subqueries rather than joins on purpose, so asset counts don't fan out across spaces:

```sql
SELECT b.building_id, b.building_name, b.floor_area_m2,
  (SELECT COUNT(*) FROM dim_space s WHERE s.building_id = b.building_id) AS rooms,
  (SELECT COUNT(*) FROM dim_asset a WHERE a.building_id = b.building_id AND a.condition_grade IN ('C','D')) AS backlog_assets
FROM dim_building b;
```

## Results

These are the counts from the committed run, read from the CSVs and `estates.db`. The generator injects bad rows on purpose, for example `"BAD-CODE" if i % 17 == 0` and orphan space `S9999` every 20th asset.

| Source | Raw rows | Loaded | Quarantined | Main reason |
|---|---|---|---|---|
| assets → `dim_asset` | 120 | 107 | 13 | 8 bad Uniclass, 6 orphan space (1 overlap) |
| COBie components → `ref_cobie` | 60 | 56 | 4 | missing serial number |
| work orders → `fact_workorder` | 150 | 137 | 13 | asset not in silver |
| space surveys → `fact_space_use` | 600 | 595 | 5 | occupied > booked hours |
| statutory tests → `fact_compliance` | 16 | 15 | 1 | unparseable due date |
| spaces / buildings / condition / BMS | 60 / 3 / 15 / 1,008 | all | 0 | |

COBie completeness comes out at 93.3% (56 of 60). The SFG20 and condition-grade rules rejected nothing, because the generator always fills those fields in. They exist, but this data never exercises them. The net zero step produces 42 building-days of HDD-baselined energy, 1 anomaly (the injected 220 kWh spike in B02) and 3 candidate HVAC assets for it.

!!! note "Testing is thin"
    `tests/test_checks.py` holds one smoke test. It regenerates data, runs ingest and validation, and asserts that at least one asset was quarantined and that COBie completeness is below 100%. It shows the pipeline runs end to end. It doesn't test each rule on its own.

When I queried the warehouse, I also found a gap the rules don't cover. The generator gives each asset a random `building_id` that doesn't depend on its space, and 65 of the 107 loaded assets sit in a space that belongs to a different building. No check compares `dim_asset.building_id` with `dim_space.building_id`, so building-level counts in `vw_emr_summary` aren't consistent with the space hierarchy.

## What I'd do next

1. **Reference tables instead of regexes.** Load the published Uniclass Ss table and a real SFG20 schedule extract as `dim_uniclass` and `dim_sfg20`, then validate by lookup. That gives descriptions, hierarchy roll-ups and task frequencies, so SFG20 compliance becomes "PPM done within its interval" and not "column not empty".
2. **Fix the quarantine reasons.** Every rule should write its own reason code, so each fail file can be sent back to whoever supplied it.
3. **Derive, don't duplicate.** Take `building_id` for an asset from its space, or add a consistency rule. Turn on `PRAGMA foreign_keys` so SQLite enforces the schema too.
4. **One unit test per rule**, with small hand-built fixtures, plus an alert when the quarantine rate goes over a threshold.
5. **Full COBie ingest.** Read a multi-sheet COBie workbook and check cross-sheet references (Component → Type → Space), which is where real handover data tends to break.

The case page with the architecture diagram is here: [Digital Estates Platform case study](../projects/digital-estates.html). The case page doesn't link a public repository yet.
