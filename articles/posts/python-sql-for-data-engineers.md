---
title: "The Python and SQL I actually use: CTEs, join tuning, Pandas cleansing"
date: 2026-11-08
summary: "A practical guide to the SQL and Python patterns I rely on as a data engineer: shrink-then-join CTEs, templates a model can't reshape, keyed upserts, and pandas as a careful reader of messy Excel. With the lessons my own pipelines taught me."
tags: [SQL, Python, Data Engineering]
draft: false
---

Most of my working day is Python and SQL. Not Spark, not a new framework: plain queries and plain scripts that move data between systems without losing or duplicating it. This guide is the set of habits I actually use, with the places they came from and what they taught me. Evidence: drawn from my production work at Waffarha (the support assistant's ClickHouse layer and the nightly recommender), a paying freelance client's clinic warehouse, reported outcomes from my Nexlify engagement, and one portfolio project on synthetic data.

## Where the evidence comes from

| Work | Status | What the SQL and Python did |
|---|---|---|
| Waffarha support assistant | Production | Fixed SQL templates over a read-only, row-capped ClickHouse client |
| Waffarha nightly recommender | Production | Python event processing, ClickHouse active-offer filter, MySQL batch upserts |
| Waffarha price-integrity check | Production | Python pipeline: config-driven price rules, rapidfuzz matching, resumable checkpoints |
| Clinic warehouse (freelance client) | Client | pandas Excel reader, quality scan, diff, PostgreSQL upserts |
| Nexlify clinic warehouse | Client, production | SQL refactor across four dialects; reported outcomes only, no code on disk |
| Estates portfolio | Portfolio, synthetic data | DuckDB validation SQL with window functions |

The Nexlify numbers (about 30% lower query latency, zero dashboard timeouts) are outcomes I report on my CV. The benchmark logs and query plans stayed with the client, so I treat them as reported results, not something I can reproduce here. The full story is in [One warehouse, ten clinics](../articles/one-warehouse-ten-clinics.html).

## CTEs: shrink first, then join

At Nexlify, legacy reporting SQL was timing out. Daily volumes were in the hundreds to low thousands of rows, so I treated it as a query-shape problem, not a hardware one. I broke large queries into CTEs, reworked the joins and added missing indexes, across PostgreSQL, SQL Server, MySQL and SQLite.

The main value of CTEs was not speed. It was that I could run each step on its own, check its row count, and see where a join was fanning out. Faster plans came after that.

The habit I carried forward is: reduce the rows in a CTE, then do the fan-out joins on the small set. Here is the shape of the recommendation-candidates query in the Waffarha assistant, trimmed to the structure, with table and column names made generic (the real file selects about 30 columns):

```sql
WITH top_offers AS (
    SELECT o.offer_id, o.partner_id, o.title_ar,
           (o.coupons_sold + 10 * ifNull(o.rating, 0) * 100) AS popularity
    FROM offers AS o
    INNER JOIN partners AS p ON p.partner_id = o.partner_id
    WHERE o.status = 'active'
      AND o.deleted_at IS NULL
      AND (o.expires_at IS NULL OR o.expires_at > now())
    ORDER BY popularity DESC
    LIMIT {{limit}}
)
SELECT t.offer_id, t.title_ar,
       countIf(b.status = 'active') AS active_branches
FROM top_offers AS t
LEFT JOIN branches AS b ON b.partner_id = t.partner_id
GROUP BY t.offer_id, t.title_ar, t.popularity
ORDER BY t.popularity DESC
```

An offer can have many partner branches. If I joined branches first and limited afterwards, the engine would build the branch rows for every active offer and then throw most of them away. Limiting inside the CTE means the branch join only ever sees the shortlist.

For analytical questions I lean on window functions. In the estates portfolio (synthetic data, DuckDB), mean time between failures per asset is a `LAG` over each asset's completed reactive jobs:

```sql
SELECT asset_id,
       DATE_DIFF('day',
         LAG(completed_ts) OVER (PARTITION BY asset_id ORDER BY completed_ts),
         completed_ts) AS gap_days
FROM main.fct_work_order
WHERE wo_type = 'Reactive' AND status = 'Complete'
```

## SQL a model can't reshape

The Waffarha assistant answers questions about a customer's own coupons and orders from live ClickHouse data. The model never writes SQL. Queries are fixed `.sql` templates in the repository, and a strict renderer fills them. From `sql.py`:

```python
rendered = PLACEHOLDER_RE.sub(substitute, template)
if missing:
    raise SqlRenderError(f"missing SQL parameters: {', '.join(sorted(set(missing)))}")
unused = set(values) - used
if unused:
    raise SqlRenderError(f"unused SQL parameters: {', '.join(sorted(unused))}")
```

Every value goes through one escaping function. Table and column names are hard-coded in the template, so a value can change what a query returns but never what the statement is. The client opens its session with `readonly=2`, a server-side execution timeout and a result-row cap, so even a bad template can't write or run away.

The cost is coverage. A question no template fits gets a handoff to a human, not an answer. An "8-layer guarded SQL" fallback for open analytical questions is the next design step in the project plan. More on this in [Deterministic gates before the LLM](../articles/deterministic-gates-before-llm.html) and [Waffy](../articles/agent-that-cant-go-rogue.html).

## Keys make re-runs boring

Every batch job gets re-run, by a scheduler or by a tired person. My rule is that a second run must replace the first, never add to it. Three versions of that rule from my own code:

**Upsert on the natural key.** The nightly recommender writes to MySQL on AWS RDS in 5,000-row batches with `INSERT ... ON DUPLICATE KEY UPDATE`, keyed on the user, committing per batch (`db_access.py`). See [Fail open, never fail the night](../articles/fail-open-nightly-recommender.html).

**Make a key when the source has none.** The clinic client re-sends the whole Excel workbook every day. I added an `Entry_ID` column and fall back to a SHA-256 of phone, date, time and sequence when it is missing. `fact_orders.source_row_id` is `UNIQUE`, so reloading the same sheet updates rows instead of duplicating them.

**Version instead of overwrite.** In an earlier RAG prototype at Waffarha, the offer store kept SCD2-style history in SQLite: hash the content fields, and if the hash or status changed, close the current row and insert a new one. Records that vanish upstream become a `deleted` version, not a silent drop. The code is in [Airflow patterns that survive a rerun](../articles/airflow-production-patterns.html).

That store lives in an archived prototype, and its MySQL source view didn't expose offer validity dates, so `valid_from`/`valid_to` stayed empty for that source. The pattern held up; the source didn't give it everything it needed.

## Pandas: a careful reader, not a calculator

In my client work, pandas does less than people expect. In the clinic ETL ([the six-stage write-up](../articles/six-stage-client-etl.html)) its main job is to read the workbook without guessing:

```python
df = pd.read_excel(excel_path, sheet_name=sheet_name, dtype=object)
missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
```

`dtype=object` stops pandas from turning phone numbers into floats or dates into whatever it infers. Then small, boring functions do the cleansing, one field type each: `clean_str` turns blanks and NaN into `None`, `clean_phone` keeps digits only, `split_multivalue` splits `Department` on `/` and services on `|`. The quality scan and the diff walk the rows and report problems; the database load comes after.

The diff is the stage I'd keep if I could keep only one. It compares the file to `fact_orders` and reports new, changed, unchanged and in-the-database-but-not-in-the-file rows. The ETL never deletes that last bucket. A row disappearing from a hand-edited sheet might be a real removal or an accident, and a person should decide.

At Nexlify the cleansing was bigger: mixed Arabic and English text across millions of historical records, normalised in Python before load. The Waffarha assistant does the same kind of normalisation inside ClickHouse (alef variants, taa marbuta, Arabic-Indic digits) as a trusted SQL fragment, so offer search isn't thrown off by spelling variants.

## Lessons my own pipelines taught me

- **Quality checks should mirror the schema.** Every constraint in the DDL now needs a matching rule in the quality scan ([why](../articles/six-stage-client-etl.html)).
- **One bad row rolled back the batch.** The clinic load ran in one transaction and called `rollback()` on a row error, with no savepoint, while the counters kept counting (fixed after the handover review).
- **A diff that looks at too few columns.** The clinic diff compares four fields. A change that touches only a comment or a staff name is reported as "nothing to write".
- **Silent defaults.** `clean_amount` returns `0.0` for a blank cell. That keeps the load moving, but it makes "unknown" and "zero" the same number in a revenue report.
- **Keep receipts.** I now save query timings and plans next to any performance change, in a form I own.
- **Row-by-row pandas.** The scan uses `iterrows`. At 4,925 rows that is fine. At a few hundred thousand I'd vectorise the checks or move them into SQL.

## When I reach for something else

```text
Data fits on one machine, logic is per row, source is messy files  -> Python + pandas, then SQL load
Question is a join or aggregate over warehouse tables              -> SQL in the database, CTEs first
Same checks must run on every build, documented                    -> dbt tests or Great Expectations
Local analytics over Parquet, no server                            -> DuckDB
Volume no longer fits one machine                                  -> Spark
A model needs data from a database                                 -> fixed templates, read-only client
```

The common thread is that I push work to where it is easiest to check. SQL that I can run step by step, Python functions small enough to test one at a time, and keys that make a second run harmless.
