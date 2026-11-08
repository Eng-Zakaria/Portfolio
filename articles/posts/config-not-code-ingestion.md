---
title: "Config, not code: schema-drift gates and a cdp CLI"
date: 2026-11-08
summary: "A v1 ingestion scaffold where each scraped site is a YAML file, a drift check stops the run when selectors stop matching, and one CLI covers setup to scheduling. On its first live run, the gate failed every source, which is what it was built to do."
tags: [Data Ingestion, Data Quality, Airflow]
draft: false
sources:
  - component-data-pipeline/README.md
  - component-data-pipeline/docs/roadmap.md
  - component-data-pipeline/docs/sources_evaluated.md
  - component-data-pipeline/configs/sources/sparkfun.yaml
  - component-data-pipeline/configs/sources/ti.yaml
  - component-data-pipeline/configs/sources/mouser.yaml
  - component-data-pipeline/src/scrapers/base.py
  - component-data-pipeline/src/quality/validators.py
  - component-data-pipeline/src/ingestion/landing.py
  - component-data-pipeline/src/api_clients/mouser_client.py
  - component-data-pipeline/cli/main.py
  - component-data-pipeline/cli/commands/run.py
  - component-data-pipeline/cli/commands/doctor.py
  - component-data-pipeline/cli/commands/sources.py
  - component-data-pipeline/cli/commands/schedule.py
  - component-data-pipeline/cli/commands/check.py
  - component-data-pipeline/cli/run_log.py
  - component-data-pipeline/dags/component_pipeline_dag.py
  - component-data-pipeline/tests/test_html_scraper.py
  - component-data-pipeline/data/.run_log.json
  - Profile/Portfolio/projects/component-data-pipeline.html
---

**Evidence: Portfolio.** I built this alone as a portfolio project while applying for a Data Automation Engineer role. It was not built for an employer or a client, and it uses only public websites and a free public API. It is a v1 scaffold: it covers ingestion, raw landing and a quality gate. The transform job, the warehouse and the analytics API are still on the roadmap, and I don't claim any of them work.

## The problem

Electronic component data, meaning part numbers, prices, stock and datasheets, is mostly published as HTML pages owned by somebody else. A scraper written against one page layout works until the site changes its theme. When it breaks, it usually breaks without an error. A CSS class gets renamed, the selector returns `None`, the job still finishes green, and you end up with a table of empty prices that looks like a healthy one.

So I wanted three things:

1. A layout change should mean editing a config file, not the scraper code.
2. A layout change I haven't caught yet should stop the run, not load empty fields.
3. Someone who didn't write the project should be able to check, run and schedule it without reading the source.

## Architecture

Each source is one YAML file in `configs/sources/`. The v1 sources are SparkFun and Texas Instruments, both scraped from HTML, and Mouser, through its official API. Everything else is generic.

```text
configs/sources/*.yaml
        |
        v
SourceConfig.from_yaml()  ----------------------------+
        |                                             |
  source_type: html                            source_type: api
        |                                             |
ConfigDrivenScraper                            MouserClient
  fetch (3 retries, exp. backoff)                (3 retries, keyword search)
  parse cards with CSS selectors from YAML
  map fields via field_map
  _check_schema_drift()  -- fails --> SchemaDriftError (nothing written)
        |                                             |
        +--------------------+------------------------+
                             v
            write_raw_records()  ->  data/raw/<source>/<date>/records.jsonl
                             |
                             v
            validate_jsonl()  (null rate per required field, duplicate count)
                             |
                             v
            data/.run_log.json  ->  cdp status
```

Here is the SparkFun config, trimmed a little:

```yaml
source_name: sparkfun
source_type: html
schema_version: 1
base_url: "https://www.sparkfun.com"
start_urls:
  - "/development-boards/microcontrollers.html"
  - "/sensors.html"
  - "/components/resistors.html"
pagination:
  param: "p"
  start_page: 1
  max_pages: 5          # safety cap
rate_limit_seconds: 1.5
selectors:
  product_card: "li.product-item"
  name: "a.product-item-link"
  url: "a.product-item-link"
  price: "span[data-price-type='finalPrice'] .price"
field_map:
  product_name: name
  product_url: url
  list_price: price
required_fields:
  - product_name
  - product_url
```

The scraper reads `selectors`, applies each one inside every `product_card`, renames the results through `field_map`, and stamps each record with `_source` and `_schema_version`. The landing module adds `_ingested_at`. Nothing in `ConfigDrivenScraper` mentions SparkFun.

## Decision 1: the drift gate raises before anything lands

The core check sits at the end of `ConfigDrivenScraper.run()`, before any records are written:

```python
if not records:
    raise SchemaDriftError(
        f"{self.config.source_name}: zero records scraped — "
        "selectors likely no longer match the page structure."
    )

for required in self.config.required_fields:
    missing = sum(1 for r in records if not r.get(required))
    null_rate = missing / len(records)
    if null_rate > null_rate_threshold:   # default 0.5
        raise SchemaDriftError(...)
```

There are two cases. Zero cards means the `product_card` selector no longer matches. If any required field is null in more than 50% of records, a field selector has drifted. In both cases the error message names the field and the YAML file to fix.

After landing there is a second, stricter check. `validate_jsonl()` fails a file when a required field is null in more than 30% of records, and it also counts duplicates on `product_url` (or `product_name` if there's no URL field). In the CLI, a file that fails this check is recorded as `quality_fail`, which is different from `error`.

**Trade-off.** A null-rate threshold is a blunt tool. It catches a selector that broke completely. It won't catch one that now picks up the wrong element, like a "was" price instead of the current price. It also only covers fields I list as required, so `list_price` on SparkFun could go fully null and the drift check would let it through. I accepted that for v1: required fields get a hard failure, and the other fields depend on downstream checks I haven't built yet. The 50% and 30% thresholds are my own judgement calls. I didn't tune them on data.

!!! note "The gate's first real run"
    The run log in the repo (`data/.run_log.json`) has one live attempt per source, all on 7 August 2026. All three failed. SparkFun: `field 'product_name' is null in 64% of 791 records (threshold 50%)`. TI: `zero records scraped`. Mouser: `MOUSER_API_KEY not set`. Nothing was written to the landing zone. The gate did its job, but it also means the SparkFun selectors don't match the live site any more, and the roadmap line saying they were "verified against live markup" is out of date.

## Decision 2: one CLI, with the checks before the run

`cdp` is a Click app (`pyproject.toml` maps `cdp = "cli.main:cli"`) with seven commands:

| Command | What it actually does |
|---|---|
| `cdp doctor` | Checks Python ≥ 3.10, that 7 packages import, `.env` present, API key set (optional), write access to the landing folder, and that every YAML parses |
| `cdp sources list` / `info <name>` | Table of sources; `info` fetches the live `robots.txt`, checks each start URL against it, and prints a pre-run checklist |
| `cdp run <name>` / `run all` | Fetch, land, validate, log; `run all` catches each source's failure so one bad source doesn't stop the others, then prints a summary table |
| `cdp check` | Runs `doctor`, then re-validates every file under `data/raw/` |
| `cdp status` | Last outcome per source from `data/.run_log.json` |
| `cdp schedule` | Prints a cron line for `cdp run all` (hourly or daily); `--install` adds it to the crontab after a confirm prompt |
| `cdp test` | Runs `pytest tests/ -v` |

The intended order is doctor, then run, then status, then schedule. `doctor` comes first because most failed runs I hit were environment problems, like a missing key or a broken YAML, not scraper problems.

**Trade-off.** Two ways of scheduling now exist side by side. `cdp schedule` writes a cron line for one machine. The Airflow DAG (`dags/component_pipeline_dag.py`) is the intended production orchestrator, with `retries: 2`, a 10-minute retry delay, `email_on_failure` and `@daily`. They don't share code. The DAG calls the scraper and validator modules directly, not through `cdp`, so the two paths can drift apart. The DAG is also explicitly a skeleton. It has not been deployed, and its transform and load tasks are TODO comments.

## Decision 3: use the API where one exists, and write down what I skipped

Mouser has a free official API, so I used it instead of scraping. It still has a YAML file, so `sources list`, `run` and `check` treat it like the other sources. `docs/sources_evaluated.md` lists the sources I considered and why I deferred them. For example, LCSC has no public API, rate-limits aggressively and has blocked scraper IPs, and Digi-Key and Newark both have official APIs, so I'd use those instead of scraping. Every HTML config also sets a `rate_limit_seconds` and an identifying `user_agent`.

**Trade-off.** API sources are only partly config-driven. In `cli/commands/run.py`, the dispatch for `source_type: api` is hard-coded to `source_name == "mouser"`. Any other source type raises `NotImplementedError`. A second API source needs a new client class and a new branch. "YAML only" holds for HTML sites that render without JavaScript. TI's config even has a `render_mode: rendered` option, but the scraper raises `NotImplementedError` for it.

## Results

What the files show:

- **Sources configured:** 3 (2 HTML, 1 API). None has produced a passing live run yet (see the note above).
- **Tests:** 3, all passing offline against a saved SparkFun HTML fixture. They check that the fixture parses to 3 records, that `field_map` normalisation works (name, URL, price `$45.65`, `_source`, `_schema_version`), and that a renamed `product_card` selector raises `SchemaDriftError`. Nothing tests the validator, the Mouser client, the CLI or the DAG.
- **Onboarding a new HTML source:** adding `configs/sources/<name>.yaml` is enough for `cdp sources list`, `cdp run <name>`, `cdp run all` and `cdp status` to pick it up. That part is real. The Airflow DAG, though, has a hard-coded `SOURCE_CONFIGS` list and needs a code edit. I haven't added a fourth source, so I have no measured onboarding time.
- **Landing:** local JSONL partitioned by source and date. The S3 swap would touch only `src/ingestion/landing.py`, but that's still a roadmap item.

## What I'd do next

1. **Fix SparkFun's selectors and get one green live run.** The gate says they're broken, so the project currently has zero working live sources.
2. **Make the DAG read `configs/sources/` the way the CLI does**, so adding a YAML file onboards a source everywhere. While I'm there, have the DAG's quality gate use each source's own `required_fields` and only today's partition. Right now it globs every file and checks only `product_name`.
3. **Drive API sources from a registry** keyed by name, instead of an `if` on `"mouser"`.
4. **Make the thresholds per-source config** and add a row-count floor compared to the last good run, so a site that quietly drops half its catalogue gets caught.
5. **Add tests for the validator and `cdp run`**, including the `quality_fail` path.
6. Then build the parts the roadmap already lists: S3 landing, the Glue/Spark transform to silver and gold, the Redshift schema, and the API.

The full case study is at [Component Data Pipeline](../projects/component-data-pipeline.html). The case page doesn't link a public repository, so there's no GitHub link here.
