---
title: "Preflight, quality, diff, backup, load: a 6-stage ETL for a paying client"
date: 2026-11-08
summary: "How I turned a clinic's daily Excel workbook into a PostgreSQL star schema with a six-stage ETL, and what the first real runs showed me about the gaps between the stages."
tags: [ETL, Data Quality, MySQL]
draft: false
sources:
  - free-lancing/pds/pg/etl_floor11.py
  - free-lancing/pds/pg/001_init.sql
  - free-lancing/pds/pg/002_seed.sql
  - free-lancing/pds/pg/DOCUMENTATION.md
  - free-lancing/pds/pg/config.ini
  - free-lancing/pds/pg/etl.log (run log; contains personal data, not published)
  - free-lancing/pds/mysql-floor17/README.md
  - free-lancing/pds/mysql-floor17/DOCUMENTATION.md
  - free-lancing/pds/mysql-floor17/backup_db.py
  - free-lancing/pds/mysql-dw/etl_flat_to_dw.py
  - free-lancing/pds/mysql-dw/scripts/validate_etl.py
---

**Evidence: Client.** This is freelance work for a paying client, a multi-floor medical clinic. The code and data are private, so there is no repo link. The examples below are sanitized and show only table and column names.

## The problem

The clinic's data entry team records every conversation, order, visit and upsell in Excel. Each day I received the whole workbook again, refreshed, not just the new rows. The owners wanted Power BI reports on revenue, per-staff contribution and patient follow-ups.

Three things made this harder than "load Excel into a database":

- **Full re-sends.** A plain `INSERT` each day would duplicate every order once per day. The first MySQL version's README says it directly: append "isn't literally append".
- **Hand-typed staff names.** The same person can be the salesperson on one order, the upseller on another, and the person who performed the treatment on a third. Names are free text, so typos and spelling variants are normal.
- **Multi-value cells.** One order can have several departments (split on `/`), several services and performers (split on `|`), and up to two upsells as column pairs plus an overflow cell in `Name:Amount/Name:Amount` format.

I built this in two steps. The first was a MySQL sync for one floor. It upserted keyed tables and deleted and re-inserted child rows for every order in the file, all inside one transaction. The second, which this article covers, is a PostgreSQL warehouse (`clinics_dw`) with a six-stage daily ETL, designed so a second floor could load into the same database later.

## Architecture

The entry sheet has 29 required columns. The warehouse is a star schema with five dimensions, one fact table at order grain, four bridge tables for the multi-value fields, and one operational table that is not part of the star.

```text
 daily .xlsx (full re-send)
        |
        v
 [1/6] FILE PREFLIGHT ....... readable? 29 expected columns present?
 [2/6] DB SCHEMA CHECK ...... live information_schema vs EXPECTED_SCHEMA
 [3/6] DATA QUALITY SCAN .... critical nulls, bad Status_Stage /
                              Order_Sequence, duplicate Entry_ID
 [4/6] DIFF REPORT .......... new / changed / unchanged / DB-only
        |                     (--dry-run stops here: no writes)
        |  any new or changed rows?
        |-- no --> skip backup and load
        v
 [5/6] BACKUP ............... timestamped pg_dump
 [6/6] LOAD ................. upsert by source_row_id, rebuild bridges,
        |                     link journey chains
        v
 PostgreSQL clinics_dw
   dim_clinic  dim_staff  dim_patient  dim_department  dim_service
   fact_orders
     +-- fact_order_department   +-- fact_order_service
     +-- fact_order_performer    +-- fact_order_upsell
   etl_unmatched_staff (operational log)
        |
        v
 Power BI (role-playing staff relationships, patient drillthrough)
```

The stage people tend to skip is stage 2, a schema drift check. It reads `information_schema.columns` for the `public` schema and compares it to a hard-coded map of the tables and columns the script depends on. It is there to catch drift, for example a hand-edited table or a migration that was only partly applied, before the load runs into it.

What each stage actually does:

| Stage | What it checks or does | Does it stop the run? |
|---|---|---|
| 1. File preflight | File exists, parses, has the expected columns, is not empty | Only if the file can't be read |
| 2. DB schema check | Missing tables or columns vs the script's expectations | No, it logs warnings |
| 3. Data quality scan | Nulls in 3 critical fields (`Phone`, `Order_Date`, `Status_Stage`), invalid status or sequence, duplicate `Entry_ID`; warnings for 4 important fields. Writes `data_quality_report.csv` | No |
| 4. Diff report | Compares the file to `fact_orders` for this clinic | Stops if `--dry-run` |
| 5. Backup | Full `pg_dump` before any write | Skipped if nothing is pending; a failure only logs a warning |
| 6. Load | Upsert orders, rebuild bridge rows, resolve journey links, export unmatched staff | n/a |

## Decision 1: a stable row key, not row position

Daily reruns are only safe if the ETL can recognise a row it has seen before. I added an `Entry_ID` column to the sheet and use it as the natural key. When it is missing, the code falls back to a hash:

```python
def make_source_row_id(row):
    entry_id = clean_str(row.get("Entry_ID"))
    if entry_id:
        return f"eid:{entry_id}"
    fallback_parts = [
        clean_phone(row.get("Phone")) or "",
        str(to_date(row.get("Order_Date")) or ""),
        clean_str(row.get("Order_Time")) or "",
        str(row.get("Order_Sequence") or "1"),
    ]
    raw = "|".join(fallback_parts)
    return "hash:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
```

`fact_orders.source_row_id` is `UNIQUE`, so the load updates existing orders instead of duplicating them. Bridge rows have no natural key, so for each order the load deletes its department, service, performer and upsell rows and inserts the current ones. That is how corrections in the sheet reach the database, not just new rows.

The trade-off is in the fallback. If anyone edits the phone, date or time on a row with no `Entry_ID`, its hash changes and the row looks new. The quality scan flags every missing `Entry_ID` as a warning for that reason.

The same key drives the diff. It reports four buckets, and the fourth is the one I care about most: orders that are in the database but missing from today's file. The ETL never deletes those. A row disappearing from a hand-edited sheet could be a real removal or an accident, and I did not want an ETL to make that call silently.

## Decision 2: match staff, never create them

This is where the two versions differ most. The later MySQL warehouse loader auto-creates unknown staff with `group_name = 'Unassigned'` so rows stop erroring. In the PostgreSQL version I went the other way. `dim_staff` is maintained by hand in a seed file, every staff member has one of six groups enforced by a `CHECK` constraint, and the ETL only looks names up:

```python
self.cursor.execute(
    """INSERT INTO etl_unmatched_staff (clinic_id, role_context, raw_name, source_row_id)
       VALUES (%s, %s, %s, %s)""",
    (self.clinic_id, role_context, name, source_row_id),
)
self.stats["unmatched_staff"] += 1
return None
```

The order still loads. Only the staff link is `NULL`, and the raw name, the role it appeared in, and the source row go into a review table that is exported to CSV after each run. An unknown name is either a typo, where auto-creating would make a ghost employee who splits someone's revenue, or a new hire, who needs a group chosen by a person. Either way it needs a human. The cost is a review queue someone has to work through before per-staff numbers are complete.

Staff and every other dimension are scoped by `clinic_id`, with `UNIQUE(clinic_id, name)` constraints. The same phone at two floors becomes two unrelated patients. That rules out cross-floor patient questions. In exchange, one floor's data can never be miscounted as another's, which mattered more here because staff names collide.

## Decision 3: check everything, block almost nothing

Only an unreadable file stops the pipeline. Schema drift, critical quality problems and backup failures all log warnings and carry on. Rows with a null critical field still load by default, unless they have no phone at all, because then there is no patient to attach them to. A `--drop-null-rows` flag excludes them instead, and `--dry-run` runs stages 1 to 4 so the choice can be made after reading the report.

I chose this because the client needed numbers every day, and a sheet that is 99% fine should not block a whole day's reporting. The first real runs showed what that costs.

## Results

The ETL logs every run to a rotating file (2 MB per file, 5 files kept). The log has two full runs against the same 4,925-row sheet on the same evening.

| | Run 1 | Run 2 |
|---|---|---|
| Rows in file | 4,925 | 4,925 |
| Rows with critical problems (stage 3) | 18 | 18 |
| Rows with warnings only (stage 3) | 3,316 | 3,316 |
| Diff: new / changed / unchanged / DB-only | 4,925 / 0 / 0 / 0 | 4,925 / 0 / 0 / 0 |
| Backup | skipped, `pg_dump` not found | skipped, `pg_dump` not found |
| Rows processed | 3,867 | 4,908 |
| Errors | 1,058 | 17 |
| Unmatched staff entries | 834 | 838 |

The second run is the one that loaded: 4,908 orders, with 17 rows skipped because they had no usable phone. 838 unmatched staff names went to the review queue.

The first run is more useful as a lesson. 1,041 of its errors were the same thing: rows breaking the `patient_status IN ('new','old')` check on `fact_orders`. Stage 3 never looked at `Patient_Status`, so the quality scan said nothing and the database caught the problem one row at a time. A quality stage that doesn't mirror the database's constraints is only a partial check.

!!! note "Two bugs the logs exposed"
    **Backup.** `backup_database` opens the output file before calling `pg_dump`. When the binary is missing, it logs "skipped" but leaves an empty, timestamped `.sql` file behind. Both backup files from these runs are 0 bytes. That looks like a restore point and isn't one.

    **Rollback.** The load runs in one transaction and commits at the end. On a row error it calls `conn.rollback()` with no savepoint. That throws away every earlier row in the transaction too, while the counters keep counting them. So run 1's "3,867 processed" doesn't mean 3,867 rows reached the database. I can't tell from the log alone how many did.

!!! tip "Update, November 2026"
    I've since fixed both bugs described above: the backup step and the rollback behaviour. This write-up describes the code as it was at handover review, because the mistakes are the useful part.

## What I'd do next

- **Savepoint per row,** or commit in batches, so one bad row costs one row. Count inserts only after commit.
- **Make the quality stage mirror the schema.** Every `CHECK` constraint in `001_init.sql` should have a matching rule in stage 3, with normalisation (case, whitespace) applied before both.
- **Make backup a hard gate.** Check for `pg_dump` in preflight, write to a temp file and rename only on success, and stop the load if there is no backup. Add rotation, which the docs already list as missing.
- **Widen the diff.** It compares four fields: `status_stage`, `order_sequence`, `paid_amount` and `total_amount`. If only a comment or a staff name changes and nothing else in the file does, the run reports nothing to write and skips the load.
- **A run-history table** with file name, counts, errors and backup path, so "did yesterday's load work" becomes a query instead of a log search. Also tests for the small parsers (`split_multivalue`, `parse_overflow_upsells`, `to_date`, `to_time`), where a silent bug turns into a wrong number in Power BI weeks later.

The staged structure worked. The dry-run report, the diff buckets and the unmatched-staff queue gave the client and me something concrete to look at before each load. The weak points were in the handoffs between stages, and I only saw them once real data ran through.
