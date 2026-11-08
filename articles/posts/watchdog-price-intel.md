---
title: "Watchdog: a raw-first price-tracking pipeline, and the gaps before it runs"
date: 2026-11-08
summary: "A portfolio design for multi-site price tracking: Playwright fetches on Celery, raw HTML stored before parsing, a Postgres star schema, threshold alerts and a Streamlit dashboard. What the code does today, the decisions behind it, and what still has to be wired before it runs on its own."
tags: [Web Scraping, Data Pipelines, Python]
draft: false
sources:
  - watchdog-prices/README.md
  - watchdog-prices/watchdog-production-plan.md
  - watchdog-prices/src/scraper/core.py
  - watchdog-prices/src/config.py
  - watchdog-prices/src/database.py
  - watchdog-prices/src/parser.py
  - watchdog-prices/src/tasks/celery_app.py
  - watchdog-prices/src/tasks/scraper_tasks.py
  - watchdog-prices/src/tasks/parse_tasks.py
  - watchdog-prices/src/tasks/load_tasks.py
  - watchdog-prices/src/notifications/__init__.py
  - watchdog-prices/dags/watchdog_pipeline.py
  - watchdog-prices/scripts/seed_demo_data.py
  - watchdog-prices/tests/test_parser.py
  - watchdog-prices/tests/test_scraper.py
  - watchdog-prices/.github/workflows/ci.yml
---

Evidence: Portfolio project. It has not been run end to end against live sites: `data/raw/` is empty, there are no saved runs, and the only price history comes from a seed script that generates 30 days of random prices per demo target. This write-up covers the design, the parts the unit tests confirm, and the gaps I found reading the code.

## The problem

The same product sells at different prices on different sites and in different regional storefronts, and those sites change their markup without notice. A scraper that parses prices on the fly has two weaknesses. First, when a CSS selector stops matching, you get a run of nulls and no way to recover them, because the page you fetched is gone. Second, a flat list of URLs can't say "check electronics hourly, TVs every four hours" or "this storefront prices in GBP".

Watchdog is my attempt at a structured version: targets are rows keyed by product, domain, region and category; every fetch stores the raw HTML before anything is parsed; and parsing, loading, quality checks and alerts run as separate stages.

This is a different job from the partner price-integrity check I built for Waffarha ([write-up](partner-price-integrity-check.html)). That one compares partner prices against our own catalogue once a day. Watchdog is a general tracker for price history over time.

## Architecture

```text
 targets table (product x domain x region x category, interval, threshold)
        |
        v
 Celery beat (every 60 s: check_due_targets)     Airflow DAG (every 15 min)
        |                                               |
        v                                               v
 scrape_target  --Playwright-->  page HTML  -->  data/raw/<ts>_<hash>.html
        |
        v
 parse_snapshot  (BeautifulSoup + selector profile, price -> USD)
        |
        v
 Postgres star schema: dim_domain, dim_region, dim_category, dim_product,
 dim_parser_profile, targets, fact_price_snapshot, dq_scraper_health
        |
        +--> data-quality check (missing / zero prices, stale targets)
        +--> alert engine (Telegram + SMTP behind one Notifier interface)
        +--> Streamlit dashboard (trend, cross-region, availability, health)
```

The moving parts are Playwright for fetching, Celery with Redis for per-target jobs, Airflow for the stage order, Postgres through SQLAlchemy for storage, and Streamlit for the dashboard. Docker Compose defines Postgres, Redis and the Airflow services, and a GitHub Actions workflow runs lint, tests, a Docker build and a DAG import check.

Scheduling exists twice. Celery beat runs `check_due_targets` every 60 seconds and queues any target whose `check_interval_minutes` has passed. The Airflow DAG `watchdog_price_pipeline` runs on `*/15 * * * *` with `max_active_runs=1`. A second DAG, `watchdog_backfill_parse`, has no schedule and is meant for manual re-parsing.

## Decision 1: store raw HTML before parsing

`save_raw_snapshot` writes each page to `data/raw/YYYYMMDD_HHMMSS_<md5[:12]>.html`, with a short comment header that records the URL and timestamp. The parser reads from that file, not from the live page, and strips the header before parsing:

```python
if "<!-- WATCHDOG SNAPSHOT" in html:
    html = html.split("-->", 1)[1].strip()
```

The benefit is that a broken selector costs you time, not data. Fix the selector in `dim_parser_profile`, re-run the parse over the stored files, and the price series comes back.

The cost is disk space and a retention decision. The code makes that decision for you: a Celery beat job, `cleanup_old_snapshots`, runs every hour and deletes raw files older than 30 days. So the real guarantee is "you can re-parse the last 30 days", not "raw HTML is never discarded". I think 30 days is a sensible default, but it should be a setting and it should be documented.

## Decision 2: Celery for fetches, Airflow for stage order

A price fetch is a small, slow, independent job that can fail on its own. That fits a task queue: `scrape_target` is a Celery task with `max_retries=3`, `autoretry_for=(Exception,)` and `retry_backoff=True`, and the worker settings use `task_acks_late=True` and `worker_prefetch_multiplier=1`, so a crashed worker doesn't silently drop a job. Airflow sits above that and owns the order: fetch, parse, load, data-quality check, a branch on the check result, dashboard refresh, alerts, stats.

The trade-off is two schedulers and two places to look when something is late. In this code the Airflow tasks call Celery with `.apply()`, which runs the work inside the Airflow worker process rather than sending it to the Celery pool. That keeps the DAG simple, but it means the Airflow path doesn't get Celery's parallelism. If I kept both, I'd pick one scheduling entry point (probably Airflow) and turn the beat job into an on-demand trigger.

## Decision 3: a star schema with per-target configuration

The warehouse has five dimensions (`dim_domain`, `dim_region`, `dim_category`, `dim_product`, `dim_parser_profile`), a `targets` table that joins them and carries `check_interval_minutes` and `price_drop_threshold_percent`, a `fact_price_snapshot` table, and an operational table, `dq_scraper_health`. Selectors live in `dim_parser_profile`, keyed by domain and optional region, so a regional storefront can share a parser with its parent site.

Every price is converted to a USD column at parse time. The conversion uses a hard-coded rate table (`EXCHANGE_RATES_TO_USD`, ten currencies, with a comment saying production would use an API). That is fine for comparing shapes on a chart. It is not fine for alerts, because a rate change looks like a price change. I'd store the original amount and currency as the source of truth (the schema already does) and convert at query time from a dated rate table.

## Crawling politely

I'd describe this part as polite crawling, not anti-bot work, and the code needs changes before I'd point it at a real retailer.

| Behaviour | What the code does today |
|---|---|
| Per-target check intervals | Yes. Seed targets use 60 to 240 minutes. |
| Retries with backoff | Yes, via Celery `retry_backoff` (3 retries). |
| robots.txt | Not checked. `respect_robots` and `robots_txt_url` are stored but never read. |
| Pacing between requests | Not applied. `_random_delay()` returns a number and is never called; `min_delay_between_requests` is unused. |
| Per-domain circuit breaker | Half done. `check_domain_health` classifies a domain from its last hour of failures, but nothing calls it to stop fetches. |
| User-agent strings | A list of 5 is defined, but the Playwright fetch picks one and never applies it to the browser context. |

Before any live run I would add four things: a robots.txt check per domain that blocks disallowed paths, a per-domain rate limit enforced in the worker, an identifying user agent with a contact address instead of a rotating browser string, and a breaker that actually pauses a domain after repeated errors. I'd also remove one Chromium launch flag that hides an automation signal. A tracker like this should respect each site's terms, and where a retailer offers a product feed or affiliate API, that is the better source.

!!! note "Which sites"
    The seed script registers amazon.com, ebay.com, bestbuy.com, newegg.com and walmart.com, with seven demo targets whose URLs are placeholders such as `https://amazon.com/sony-wh1000xm5`. They are not real product pages, and nothing in the repo shows a fetch against them. The Phase 0 script fetches `https://httpbin.org/html` as a connectivity test.

## Results

What I could verify:

- The 24 unit tests in `tests/test_parser.py` and `tests/test_scraper.py` pass locally (24 passed in 3.35 s). They cover price parsing in USD, EUR and GBP formats, availability parsing, USD normalization, the result dataclasses and raw snapshot writing.
- The integration tests in `tests/integration/` need Postgres, and I didn't run them.
- There are no recorded runs, row counts, success rates or alert logs. The dashboard renders whatever is in Postgres, which for a demo is the seeded random history.

Reading the full path end to end, I found four bugs that would stop the pipeline producing real data:

1. **Fetch never creates a snapshot row.** `scrape_target` saves the HTML file and updates the target, but it doesn't insert a `fact_price_snapshot` row. The parse stage only works on existing rows, so live fetches never reach it. Only the seed script and the tests create snapshot rows.
2. **The parse queue is always empty.** `parsed_at` has `default=datetime.utcnow`, so every new row is born "parsed", and the parse and backfill stages, which filter on `parsed_at IS NULL`, find nothing.
3. **The alert compares the wrong rows.** `check_price_drops` excludes the latest snapshot and then also applies `.offset(1)`, so it compares the newest price with the third newest. It also fires on rises as well as drops, because it tests `abs(percent_change)`.
4. **Selector-break detection counts fetch failures.** `consecutive_nulls` goes up when the page fails to load and resets on any successful load. A page that loads but no longer matches the price selector never increments it.

The DAG file also imports `CeleryTaskGroup` from `airflow.providers.celery.operators.celery`, which I don't believe that provider package contains, and the import is unused. I haven't confirmed whether the DAG loads, because the CI import check hasn't run on this copy. The README also lists structured JSON logging, a Prometheus endpoint and dead-letter handling; I couldn't find code for any of the three.

## What I'd do next

1. Fix the four bugs above, starting with snapshot creation in `scrape_target` and removing the `parsed_at` default, then add an integration test that goes from a stored HTML fixture through to an alert.
2. Add the polite-crawling controls from the table, and make them on by default.
3. Make raw retention a config value and write it into the README.
4. Replace the static exchange-rate table with dated rates, and keep alert thresholds in the target's own currency.
5. Pick one scheduler entry point and record each run (targets due, fetched, parsed, loaded) in `dq_scraper_health`, so the dashboard's health view has real numbers to show.
6. Run it for a week against a small set of sites that allow it, and publish the success rate and run counts.

## Links

- Case page: [Watchdog — Price Intelligence](../projects/watchdog-prices.html)
- Related: [Partner price-integrity check](partner-price-integrity-check.html)
