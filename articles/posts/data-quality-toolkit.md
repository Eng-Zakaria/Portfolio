---
title: "My data quality toolkit: Great Expectations, dbt tests, contracts, reconciliation"
date: 2026-11-08
summary: "The checks I put into a pipeline and where each one sits: ingest gates, quarantine and count reconciliation, declarative YAML checks run on Great Expectations and DuckDB, dbt tests and contracts, change detection, and business-rule controls in production. With real snippets and the lessons from my own runs."
tags: [Data Quality, Great Expectations, dbt]
draft: false
---

Most bad numbers I have seen were not caused by a broken pipeline. They came from a pipeline that ran fine and quietly loaded something wrong. My data quality work is about making that hard: every row accounted for, every rule written down, and a check that fails loudly when a source changes. **Evidence:** production controls at Waffarha (a price-integrity check, an eval suite used as a per-category regression gate, an audited PII redaction), a client clinic ETL, and two portfolio projects on synthetic data: an estates lakehouse with Great Expectations, dbt tests and contracts, and a component-ingest scaffold. Status is marked per project below.

## Where each check sits

I don't pick one tool. I put a different kind of check at each hand-off, because each one catches a different failure.

| Layer | What it catches | How I build it | Where | Status |
|---|---|---|---|---|
| Ingest gate | A source changed shape | Null-rate and zero-record checks, schema compare | Component ingest; clinic ETL | Portfolio; client |
| Quarantine + reconciliation | Rows lost or invented | Reject with a reason; `silver + quarantine == bronze` | Estates lakehouse | Portfolio, synthetic |
| Declarative checks | Invalid, duplicate, orphan, late data | YAML specs run on Great Expectations or DuckDB SQL | Estates lakehouse | Portfolio, synthetic |
| dbt tests + contracts | Broken models and changed column types | Generic, singular and unit tests; enforced contracts | Estates lakehouse | Portfolio, synthetic |
| Change detection | Silent updates and deletions | Content hashes, diff buckets, versioned history | Waffarha; clinic ETL | Production; client |
| Business rules | Data that is valid but wrong | Tolerance bands, eval suites, leak audits | Waffarha | Production |

## Gate at the door

The cheapest check runs before anything lands. In the component-ingest scaffold (a portfolio project) each scraper ends with a drift gate:

```python
for required in self.config.required_fields:
    missing = sum(1 for r in records if not r.get(required))
    null_rate = missing / len(records)
    if null_rate > null_rate_threshold:   # default 0.5
        raise SchemaDriftError(...)
```

The gate caught SparkFun's layout change on the first live run (7 August 2026): `product_name` was null in 64% of 791 records, and nothing reached the landing zone. Updating the selectors is next. A null-rate threshold is blunt. It catches a selector that broke completely, not one that now picks up the wrong price. More in [Config, not code](../articles/config-not-code-ingestion.html).

The clinic ETL (paying client) has a preflight for the file's 29 required columns, then a schema check that compares live `information_schema.columns` with the tables and columns the script depends on. That one logs a warning and carries on, which is a choice I come back to below. See [the six-stage ETL](../articles/six-stage-client-etl.html).

## Quarantine, then prove nothing went missing

In the estates lakehouse, silver code may only drop a row by moving it to quarantine with a reason string. That makes loss a matter of addition: raw must equal bronze, and `silver + quarantine` must equal bronze, with anything left over reported as unexplained.

For the two wide meter and BMS sources the grain is cells, not rows, because silver unpivots them. The acceptance run on 4 October 2026 passed 8 of 8 sources with zero unexplained rows or cells. The code and the full story are in [Proving zero loss](../articles/estates-lakehouse-zero-loss.html).

!!! note "What count reconciliation does not prove"
    Counts balance even when one row is lost and another is duplicated. Reconciliation proves nothing went missing at an aggregate level. It does not prove the rows are right, and it is not compared against the generator's ground truth. That is what the next layer is for.

## Declarative checks: YAML in, Great Expectations and SQL out

The estates quality framework (P03) has 133 checks over 10 datasets, written as YAML. Each check has a dimension, a severity, a threshold, an owner and a reason, and names its engine. 58 run on Great Expectations 1.23.2, 41 run as SQL on DuckDB, and 34 are recall checks against the planted defects.

```yaml
- id: wo_id_unique
  dataset: work_orders
  dimension: uniqueness
  severity: error
  threshold: 100.0
  owner: estates-analytics
  why_it_matters: Duplicate orders inflate reactive counts and spend.
  engine: gx
  expectation: ExpectColumnValuesToBeUnique
  kwargs: {column: WO_Number}
```

A SQL check carries two queries: one counts the rows checked, the other returns the failing rows, so a failure comes with the evidence attached. I use Great Expectations where a built-in expectation says exactly what I mean (not null, unique, regex), and SQL where the rule spans columns, like a completion date before the raised date.

Scores follow a written policy: `score = 100 * sum(w * pass_rate) / sum(w)`, with error weighted 3 and warn 2. Any failing `error` check writes an alert row and turns CI red, and a dataset score that drops more than 5 points against its trailing 7-run mean raises a score-drop alert. On the acceptance run, every planted defect type was detected (100% recall per type), and 51 tests pass. Next is regenerating the clean, zero-defect profile to confirm no false alarms on clean data.

!!! note "Telecom: GE rules in design"
    The telecom portfolio design also has GE rules for CDRs, network KPIs and billing, plus a schema-drift check that marks new columns as blocking. Aligning the validator with the current Great Expectations API and wiring in the drift check are its next steps. See [the telecom write-up](../articles/telecom-lakehouse-8-domains.html).

## dbt tests and contracts

The estates dbt project (P04) has 160 tests: 147 data tests, 2 unit tests and 11 singular tests. All 21 marts have enforced contracts, so a model that changes a column's name or type fails the build. The small-profile build finished `PASS=196 WARN=0 ERROR=0`, where 196 counts every node that passed, not just tests. The full-volume profile run is next.

Generic tests (`not_null`, `unique`, relationships) cover keys. Singular tests cover what generic ones can't. This one fails if any fact row has no matching cleaned input row, which means a join invented it:

```sql
SELECT f.meter_id, f.ts_utc
FROM {{ ref('fct_meter_hh') }} AS f
LEFT JOIN {{ ref('int_meter_hh_cleaned') }} AS i USING (meter_id, ts_utc)
WHERE i.meter_id IS NULL
```

The acceptance doc also reconciles silver to marts and explains every gap. For example, meter half-hours go from 68,119 to 67,822, and all 297 dropped rows belong to defect meters that were never in the register.

## Change detection and history

Full re-sends and silent edits are where trust goes. In the clinic ETL, each row gets a stable key (`Entry_ID`, or a SHA-256 fallback), and a diff puts every row in one of four buckets: new, changed, unchanged, or in the database but missing from today's file. The ETL never deletes that last bucket. A human decides.

At Waffarha, the assistant's incremental index build hashes each document's text and metadata and re-embeds only new or changed documents:

```python
content_str = json.dumps(content, sort_keys=True, ensure_ascii=False)
return hashlib.sha256(content_str.encode("utf-8")).hexdigest()[:16]
```

For offer records I keep SCD2-style history. The version I can quote is from an earlier iteration of that work (`versioned_store.py`, on SQLite): a changed content hash closes the current version and inserts a new one, and a record missing from the API is versioned as `deleted` instead of vanishing. The code is in [Airflow patterns that survive a rerun](../articles/airflow-production-patterns.html).

The deleted-upstream case is the one people skip. Without it, "what happened to offer X?" has no answer.

## Business rules: valid is not the same as right

Some of the most useful checks look at data that passes every schema test. All three below run at Waffarha.

- **Price integrity.** A daily 6-stage pipeline (ingest, normalise, match, scrape, compare, report) flags a voucher as a violation unless it is at least 2% cheaper than the partner's own site, with a 5% watch band. Both numbers are config, so the commercial team can change them without a deploy. [Write-up](../articles/partner-price-integrity-check.html).
- **An eval suite as a gate.** 225 bilingual cases across 20 categories. 64 of 225 pass end to end today, tracked separately from retrieval. The suite gates per category; categories below target are tracked as open work. [Write-up](../articles/deterministic-gates-before-llm.html).
- **An independent leak audit.** For 117,915 redacted support chats, a second script with its own, stricter patterns checks 8 PII patterns. Its first run failed and found three leak types the builder missed. After the fix it reported zero matches. That means zero matches on 8 patterns, not "no personal data", so training on the set is still deferred. [Write-up](../articles/redacting-160k-support-chats.html).

## Lessons from my own runs

- **A quality stage that didn't mirror the schema.** The clinic ETL's first run showed the database's `CHECK` constraint catching rows the quality scan hadn't checked ([details](../articles/six-stage-client-etl.html)). Now I write one rule per constraint.
- **Warnings where a gate was needed.** The clinic backup and rollback steps only warned on failure (fixed after the handover review).
- **A check that can't fail the build.** The lakehouse reconciliation writes its JSON but always exits 0. The quality gate after it is what actually fails CI.
- **A gate the code doesn't enforce.** The price check's design says only high-confidence matches feed violations, but matches between 0.60 and 0.85 can still be classified as one.

## When I'd choose something else

For a dbt project, I start with dbt tests and contracts and add Great Expectations only where I need profiling, Data Docs or checks on data dbt doesn't own, such as raw files before bronze. For a small one-off ETL, plain SQL rules and a diff report go further than a framework. And whatever the tool, I make it exit non-zero. A check that only writes a report is documentation, not a control.
