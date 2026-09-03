# Claude Code Agent Prompt — Watchdog: Multi-Domain Price Intelligence Platform

Copy everything below into Claude Code as your initial instruction.

---

## PROJECT BRIEF

Build **Watchdog**, a production-grade, multi-domain e-commerce price intelligence platform. This is a portfolio project meant to demonstrate senior-level skill as both an **Automation Engineer** (browser automation, orchestration, resilience, anti-bot handling) and a **Data Automation Engineer** (ETL pipeline design, dimensional data modeling, data quality, analytics). Build it as if it will be reviewed by hiring managers for both roles — code quality, documentation, and architecture all need to reflect that bar.

Work incrementally, in the phases defined below. After each phase, run tests, confirm everything works end-to-end, commit with a clear message, and summarize what was built before moving to the next phase. Do not skip ahead to later phases before earlier ones are working and tested.

---

## SCOPE

Target products across multiple **domains** (retail sites), **regions** (locale/country variants of those domains), and **categories** (product types). Track price and availability over time, detect price drops against configurable thresholds, alert via Telegram and email, and expose the resulting price history through an analytics dashboard.

---

## ARCHITECTURE TO IMPLEMENT

```
Airflow (pipeline-level DAG orchestration, scheduling, backfills, monitoring UI)
   │
   ├─ fetch_batch_task ──► Task Queue (Redis + Celery) ──► Worker Pool (Playwright)
   │                                                          │
   │                                                          ▼
   │                                                  Raw Snapshot Store
   │
   ├─ parse_and_normalize_task ──► Parser/Normalizer Layer
   │
   ├─ load_to_warehouse_task ──► Postgres Warehouse (dimensional model)
   │
   ├─ data_quality_check_task
   │
   └─ downstream: Alert Engine (Telegram + Email) + Analytics Dashboard (Streamlit)
```

**Division of responsibility (important — implement both, do not substitute one for the other):**
- **Celery + Redis** executes the actual scrape work — many small, frequent, independently-retryable per-target browser jobs. This is task-level execution.
- **Airflow** orchestrates the pipeline as a whole — the DAG of dependent stages (fetch batch → parse/normalize → load → data-quality check → refresh dashboard → run alerts), scheduling, backfills, and providing a monitoring UI over pipeline health. This is pipeline-level orchestration, sitting above Celery, not replacing it.
- A typical Airflow task (`fetch_batch_task`) triggers a group of Celery jobs and waits for their completion before the DAG proceeds to the next stage.

Raw fetched data must be persisted before parsing (never parse-and-discard) so that a selector bug never causes permanent data loss — historical snapshots must be re-parseable, and Airflow's backfill capability should be used to re-run parse/load stages against historical raw snapshots after a parser fix, without re-scraping.

---

## PHASE-BY-PHASE BUILD PLAN

### Phase 0 — Foundation
- Single Playwright script (Python), one hardcoded product URL, extract price via CSS selector, print to console.
- Confirm this works reliably (multiple runs, handles page load timing) before proceeding.

### Phase 1 — Structured targeting model
- Introduce a Postgres-backed `targets` table keyed by `(domain, region, category)`, not a flat URL list.
- Build a selector-resolution layer: `(domain, region) -> parser profile`.
- CLI or admin script to add/list/deactivate targets.

### Phase 2 — Pipeline separation (ETL)
- Split into distinct stages: fetch (raw HTML/JSON to storage) → parse/normalize (price, currency, availability) → load (dimensional warehouse).
- Implement the dimensional schema: `dim_domain`, `dim_region`, `dim_category`, `dim_product`, `fact_price_snapshot`, plus a `dq_scraper_health` table tracking parser failures separately from price data.
- Normalize all prices to one base currency at load time.

### Phase 3 — Orchestration at scale (Celery for execution + Airflow for pipeline orchestration)
- Celery + Redis worker pool, horizontally scalable, for individual scrape job execution.
- Per-category/domain configurable check intervals.
- Retry/backoff with dead-letter handling for permanently failing jobs.
- Airflow DAG(s) orchestrating the full pipeline: `fetch_batch_task` (triggers and awaits a Celery job group) → `parse_and_normalize_task` → `load_to_warehouse_task` → `data_quality_check_task` → downstream `refresh_dashboard_task` and `run_alert_engine_task`.
- Configure Airflow scheduling to respect the same per-category/domain check-interval requirements as the Celery beat schedule (Airflow becomes the source of truth for *when the pipeline runs*; Celery remains the source of truth for *how individual scrape jobs execute*).
- Implement at least one backfill scenario as a test case: re-run `parse_and_normalize_task` and `load_to_warehouse_task` against a historical raw snapshot after simulating a parser fix, without re-fetching.
- Use the Airflow UI as the primary pipeline-health view; Celery's own monitoring (e.g. Flower) remains scoped to task-execution health.

### Phase 4 — Resilience & anti-bot handling
- Rotating user-agents, randomized request pacing, robots.txt compliance.
- Proxy support (pluggable — support a proxy pool interface even if not configured by default).
- Selector-break detection: if a parser returns null/anomalous data across N consecutive runs, raise an operational alert instead of silently failing or logging a fake price.
- Per-domain circuit breaker to stop hammering a domain that starts blocking requests.

### Phase 5 — Notifications
- Telegram bot integration and SMTP email integration, behind a common `Notifier` interface.
- Two distinct alert channels: product price-drop alerts vs. scraper operational-health alerts.
- Configurable per-target price-drop thresholds.

### Phase 6 — Analytics & dashboard
- Streamlit dashboard: price trend over time per product, cross-region price comparison for the same product, historical high/low tracking.
- This is the highest-leverage feature for the data-engineering narrative — make it genuinely useful, not decorative.

### Phase 7 — Productionization
- Dockerize every component (Celery worker, Celery beat, Airflow webserver, Airflow scheduler, dashboard) with a docker-compose setup for local development.
- GitHub Actions CI: lint → unit tests → integration tests (against recorded HTML fixtures, never live sites in CI) → build → push image.
- Structured JSON logging and a Prometheus metrics endpoint (job success/fail rate, latency per domain, active targets).
- Secrets via environment variables / Docker secrets — never hardcoded, never committed.
- README with an architecture diagram, setup instructions, and a short design-rationale section explaining the raw/staged/warehouse separation.

---

## ENHANCEMENTS TO PUSH THIS TO THE NEXT LEVEL

Once the core phases above are solid, implement as many of these as time allows — each one adds a distinct, resume-worthy capability:

1. **Anomaly detection** — flag price changes that are statistical outliers (e.g., a 90% price drop that's more likely a scraper bug or a pricing error than a real sale) using a simple z-score or IQR check, not just a flat threshold.
2. **Price prediction** — a lightweight time-series model (even a simple moving-average/seasonal decomposition) that forecasts likely future price drops, surfaced on the dashboard.
3. **REST/GraphQL API layer** — expose the warehouse data via FastAPI so the platform isn't just a closed pipeline; this demonstrates you can build for other consumers, not just yourself.
4. **Infrastructure as Code** — Terraform module to provision the cloud resources (VM/containers, managed Postgres, Redis) instead of manual setup, as a stretch beyond docker-compose.
5. **Kubernetes manifests / Helm chart** — for the worker pool specifically, since it's the horizontally-scalable component; demonstrates orchestration beyond docker-compose.
6. **Data quality dashboard** — a dedicated view (or Great Expectations-style checks) showing scraper health, failure rates per domain/region, and data freshness — separate from the price-trend dashboard.
7. **Chaos/resilience testing** — deliberately inject failures (network timeout, malformed HTML, rate-limit responses) in integration tests to prove the pipeline degrades gracefully rather than crashing.
8. **Cost/rate-limit governor** — a per-domain budget system (max requests/hour) so the platform self-throttles instead of relying only on external blocking to tell it to slow down.
9. **Multi-currency, multi-language parsing** — handle non-English product pages and non-USD/EUR price formats robustly (this is a genuinely hard, differentiating detail).
10. **Public write-up** — a blog-style `ARCHITECTURE.md` or actual blog post walking through key design decisions and trade-offs (why Celery over cron, why a raw-storage layer, how anti-bot handling was approached ethically). This single document often matters more to reviewers than any individual feature.

---

## ENGINEERING STANDARDS TO FOLLOW THROUGHOUT

- Type hints on all Python code; linting via `ruff` or `flake8` enforced in CI.
- Every parser/normalizer function covered by unit tests using saved HTML fixtures — no live-site dependency in tests.
- Meaningful commit messages, one logical change per commit.
- No secrets, API keys, or credentials committed at any point — use `.env.example` to document required variables.
- Docstrings on all public functions/classes explaining *why*, not just *what*.
- Respect robots.txt and reasonable rate limits on any real site used for testing/demo — do not build or demonstrate this against sites in a way that violates their terms of service.
- Airflow DAGs must be covered by DAG-integrity tests (import without errors, no cycles, expected task dependencies present) in addition to task-level unit tests.

---

## DELIVERABLE AT THE END

A working repository with: all phases implemented, passing CI, a populated demo dataset (real or realistically simulated), a working dashboard, a working Airflow instance showing the pipeline DAG and run history, and a README that clearly frames the project for both "Automation Engineer" and "Data Automation Engineer" audiences with an architecture diagram and real metrics from running it.
