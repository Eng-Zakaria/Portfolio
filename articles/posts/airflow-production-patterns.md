---
title: "Airflow patterns that survive a rerun: idempotency, watermarks, SCD2"
date: 2026-11-08
summary: "How I use Airflow across a production price check at Waffarha, an archived assistant prototype and a portfolio lakehouse: making reruns harmless, watermarks that can lag safely, SCD2 with a content hash, and the lessons I carry between projects."
tags: [Airflow, Data Pipelines, Data Quality]
draft: false
---

Airflow is the orchestrator I reach for most, and the one I've learned the most from. Evidence: drawn from the price-integrity DAGs I run at Waffarha (production), the client clinic warehouse at Nexlify (production, no code I can show), an archived prototype of the Waffarha assistant's ingestion, and two portfolio projects. Every snippet below is copied from those files, trimmed, with no hostnames or data.

Here is what each one is:

| DAGs | Where | Status |
|---|---|---|
| `waffarha_reachability_audit` (weekly) + `waffarha_price_integrity` (daily) | Waffarha partner price check | Production ([write-up](../articles/partner-price-integrity-check.html)) |
| Clinic intake into a star-schema warehouse | Nexlify client, 10+ clinics | Production, client-owned code ([write-up](../articles/one-warehouse-ten-clinics.html)) |
| `waffarha_mysql_offers_sync`, `pdf_kb_ingestion` | Early assistant prototype | Archived prototype: `airflow standalone`, a testing database |
| 7 DAGs with watermarks, assets, mapped tasks | Estates lakehouse | Portfolio, synthetic data ([write-up](../articles/estates-lakehouse-zero-loss.html)) |
| `component_pipeline_dag.py` | Component ingest | Skeleton ([write-up](../articles/config-not-code-ingestion.html)) |

## When I reach for Airflow, and when I don't

I use Airflow when a job has more than one stage, a stage can fail on its own, and someone needs to see which one failed. The price check is the clearest case. Seven tasks run in a line: create a run directory, load the weekly triage report, ingest, scrape, match and compare, report, log a summary. The scrape is the fragile part, so it gets its own 4-hour `execution_timeout`. The daily DAG has 2 retries with a 15-minute delay and `max_active_runs=1`.

I don't use it everywhere. The nightly recommender at Waffarha is one job with one output, so it runs as a thread inside its FastAPI service that sleeps until midnight Cairo time, with a "run now" button that refuses to start while a run is in flight ([write-up](../articles/fail-open-nightly-recommender.html)). Adding Airflow there would mean a second system to keep alive for one task.

The prototype's API sync went the same way. Its docstring says it runs standalone, "no Airflow needed for now", and that wrapping it later is a thin DAG file around one function. I still like that rule: keep the logic in a plain module, and let the DAG be a few lines that call it.

## Pattern 1: a rerun should change nothing

Retries, backfills and a tired human pressing "Clear" all rerun tasks. I design for that first.

In the price check, every output goes into a directory named after the Airflow run, so a retry of the same run writes to the same place instead of starting a second copy:

```python
def create_run_dir(**context):
    run_id = context["dag_run"].run_id
    run_dir = Path(base_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "reports").mkdir(exist_ok=True)
    (run_dir / "scraped_data").mkdir(exist_ok=True)
    return str(run_dir)
```

Inside that directory, each scraped partner gets its own checkpoint file, and a rerun skips partners that already have one. Failed partners are not checkpointed, so a retry picks them up.

In the estates lakehouse, idempotency lives one level down. Bronze hashes each landing file with SHA-256 and skips it if that source and hash are already in the manifest, and the Airflow task only re-runs silver when bronze actually loaded something:

```python
dest, entry = load_bronze(source, Path(path), root / "bronze")
silver_n, quar_n = (0, 0)
if entry.get("status") != "skipped":
    silver_n, quar_n = _run_silver_one(source, root, truth / "buildings.parquet")
```

A second full ingest run reported all eight bronze files as skipped and the silver counts didn't move. That is the behaviour I want from every task: the second run is boring.

## Pattern 2: a watermark that is allowed to be wrong

The hourly CAFM work-order DAG in the lakehouse only processes files it hasn't seen. Its watermark is not a timestamp. It is the set of file names already processed, stored as JSON:

```python
def new_files_since(source: str, watermark: dict, landing: Path = LANDING) -> list[str]:
    seen = set(watermark.get("files", []))
    return [f for f in list_landing_files(source, landing) if f not in seen]
```

I chose names over a "last modified" time because late files are normal and clocks lie. A file that lands late with an old timestamp is still a new name.

The more important choice is that the watermark is not the only defence. The DAG's own docstring says it: bronze checksums make reruns safe "even if the watermark lags". The watermark is saved after the ingest loop, so a crash in the middle leaves it behind, and the next run re-offers files that bronze then skips. A watermark that can only be too old, never too new, plus an idempotent load, means a crash costs time, not data.

The meter DAG doesn't use a watermark at all. It sweeps the whole landing zone every run and lets checksums skip what's loaded, with one mapped task per file. Downstream, `transform_and_test` is scheduled on four silver assets, so dbt runs when all four have fresh events, and a dbt failure blocks publishing but never the ingest DAGs.

## Pattern 3: SCD2 with a content hash

The assistant prototype synced public offers into a vector index. I didn't want to re-embed every offer every 15 minutes, and I wanted to answer "what happened to offer X?" after it expired. So the sync keeps an SCD2 history in SQLite and only re-embeds when something changed.

Change detection is a hash over the fields that matter, not over the whole row, so a field that changes every sync doesn't create a fake version:

```python
CONTENT_FIELDS = [
    "title_en", "title_ar", "description_en", "description_ar",
    "price", "original_price", "discount_pct", "category", "merchant",
    "valid_from", "valid_to",
]

def _content_hash(record: dict) -> str:
    payload = json.dumps({k: record.get(k) for k in CONTENT_FIELDS}, sort_keys=True, default=str)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()
```

When the hash or the derived status (active, upcoming, expired) differs from the current row, the old row is closed and a new one inserted. Nothing is overwritten:

```python
elif cur[1] != new_hash or cur[2] != status:
    conn.execute(
        "UPDATE record_versions SET is_current=0, system_valid_to=? WHERE version_id=?",
        (now_iso, cur[0]),
    )
    _insert_version(conn, entity_type, entity_id, record, status, new_hash, now_iso)
```

An offer that disappears from the source gets a "deleted" version instead of vanishing. If the sync reports zero new, updated and deleted rows, the indexing step returns early and embeds nothing.

!!! note "What this was"
    These DAGs ran in a single-container `airflow standalone` setup with a SQLite metadata database, against a testing database. They live in an archive folder now; the pattern is what carries over.

## Lessons I carry forward

- **The SCD2 delete never stops.** The "deleted" version is inserted with `is_current=1`. On the next sync the offer is still missing, so it is still "current but not seen", and it gets closed and deleted again. Every 15 minutes, one more deleted row per missing offer. The fix is to skip rows whose current status is already `deleted`.
- **The source view couldn't feed the history.** The MySQL view had no expiry dates, prices or Arabic titles; the sync file lists them as known gaps. With no `valid_to`, every offer derives as "active", so the expiry part of the SCD2 logic never fired on that source.
- **Test the handoff, not just the import.** The repo snapshot I quote had two XCom key mismatches: a pull by `key="run_dir"` where the task returns its path under `return_value`, and a pull from `task_ids="run_audit"` where the task is `run_reachability_audit`. A DagBag import passes either way. I now cover task handoffs with a DAG-level test that runs them.
- **A file as the contract between two DAGs.** The weekly audit hands the daily run a JSON file at a shared path. Nothing records how old it is. An Airflow asset, or at least a freshness check on the file, would make that dependency visible.
- **Alerting that stops at email.** The project's gap analysis notes that the only alert is `email_on_failure`, with no SLA on the 4-hour scrape. The lakehouse DAGs are better here: shared defaults with exponential backoff, a 30-minute timeout, and callbacks that write every run to `ops.pipeline_runs`.
- **Two schedulers for one job.** The price-check repo also ships Kubernetes CronJobs for the same stages, and the component skeleton has both a cron command and a DAG that don't share code. Two paths drift. One scheduler per project, and delete the other.

## When I'd choose something else

| Situation | What I'd use |
|---|---|
| One task, one output, owned by one service | An in-process scheduler or cron, like the recommender |
| A single container job with no inter-stage visibility needed | A Kubernetes CronJob with `concurrencyPolicy: Forbid` |
| Multi-stage batch, retries per stage, people reading the UI | Airflow |
| Transforms that are mostly SQL with tests | dbt, triggered by Airflow, as in `transform_and_test` |

Airflow's value for me is per-stage retries and a UI someone else can read at 3 a.m. If a job doesn't need those, I leave Airflow out.

I wrote a shorter, more general take on this, also on Medium: [Airflow Orchestration Best Practices](https://eng-zakaria.medium.com/airflow-orchestration-best-practices-lessons-from-building-production-grade-data-pipelines-0dc2a4d829e9).

*If you have a cleaner way to hand state between two DAGs on different schedules, I'd like to hear it. [Get in touch](../index.html#contact).*
