# Watchdog: Multi-Domain Price Intelligence Platform
### Production-Level Build Plan

---

## 1. Positioning

This project is deliberately built to demonstrate two overlapping skill sets:

| Angle | What it demonstrates |
|---|---|
| **Automation Engineer** | Browser automation at scale, anti-bot handling, scheduling/orchestration, resilient scraping, containerized deployment, CI/CD, monitoring |
| **Data Automation Engineer** | Schema design, ETL/ELT pipeline, data quality checks, historical trend analytics, dashboarding, incremental data loads |

The README and any write-up should lead with this framing explicitly — reviewers should not have to infer it.

---

## 2. Scope Definition

**Targeting model:** targets are defined along three axes, not just a flat URL list:

- **Domain** — which site (amazon.com, ebay.com, a regional retailer, etc.)
- **Region** — which country/locale version of that site (amazon.com vs amazon.co.uk vs amazon.ae), since price, currency, and even DOM structure can differ by region
- **Category** — product category (electronics, groceries, etc.), since selector patterns and update frequency needs often differ by category (electronics prices move often; groceries less so)

This means the target registry is a structured table, not a YAML list of URLs:

```
targets
├── id
├── domain          # amazon, ebay, noon, ...
├── region           # us, uk, ae, eg, ...
├── category         # electronics, fashion, grocery, ...
├── url
├── selector_profile  # which parser/selector-set to use
├── check_interval    # category/domain-specific frequency
├── currency
└── active (bool)
```

Selector logic should resolve as `(domain, region) -> parser`, since region variants of the same domain often share DOM structure but differ in currency/locale formatting — handle that in a normalization layer, not in each parser.

---

## 3. High-Level Architecture

```
                        ┌─────────────────┐
                        │   Scheduler      │  (orchestrates check cycles
                        │ (APScheduler /   │   per domain/region/category)
                        │  Celery beat)    │
                        └────────┬─────────┘
                                 │ enqueues jobs
                                 ▼
                        ┌─────────────────┐
                        │   Task Queue     │  (Redis + Celery/RQ)
                        └────────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ┌───────────┐      ┌───────────┐      ┌───────────┐
        │ Worker Pool│      │ Worker Pool│      │ Worker Pool│   (N containers,
        │ (Playwright│      │ (Playwright│      │ (Playwright│    horizontally
        │  browsers) │      │  browsers) │      │  browsers) │    scalable)
        └─────┬──────┘      └─────┬──────┘      └─────┬──────┘
              │                    │                    │
              ▼                    ▼                    ▼
        ┌─────────────────────────────────────────────────────┐
        │              Raw Snapshot Store (staging)             │
        │        (raw HTML/JSON dumps, keyed by run_id)          │
        └───────────────────────┬───────────────────────────────┘
                                 ▼
                        ┌─────────────────┐
                        │  Parser/Normalizer│  (extract price, currency
                        │      Layer        │   normalize, validate)
                        └────────┬──────────┘
                                 ▼
                        ┌─────────────────┐
                        │   Data Warehouse  │  (Postgres: dimensional
                        │  (facts + dims)   │   model — see §5)
                        └────────┬──────────┘
                       ┌─────────┴──────────┐
                       ▼                    ▼
              ┌─────────────────┐   ┌─────────────────┐
              │  Alert Engine    │   │  Analytics/       │
              │ (diff vs history,│   │  Dashboard         │
              │  threshold rules)│   │  (Metabase/Grafana │
              └────────┬─────────┘   │   or custom)        │
                       ▼             └─────────────────────┘
              ┌─────────────────┐
              │ Notifier (Telegram│
              │  + Email)          │
              └───────────────────┘
```

**Why this shape:** separating "fetch" (workers) → "raw storage" → "parse/normalize" → "warehouse" is the same extract/transform/load pattern a data engineer would use for any pipeline, and it means a broken parser never loses raw data — you can re-parse historical snapshots if a selector bug is found later. This raw-then-transform separation is one of the strongest "I understand data engineering" signals you can put in a portfolio.

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Browser automation | Playwright (Python) | Best modern support for dynamic sites, auto-wait, network interception |
| Task queue | Celery + Redis | Industry-standard, scalable, supports scheduling + retries natively |
| Raw storage | S3-compatible (MinIO locally, S3 in cloud) or filesystem volume for v1 | Cheap, durable, decouples fetch from parse |
| Warehouse | PostgreSQL | Relational, supports window functions for trend analysis, free tier everywhere |
| Orchestration/scheduling | Celery beat (or Airflow if you want to lean harder into "data engineer") | Airflow is heavier but is a strong resume keyword; Celery beat is lighter and sufficient |
| Containerization | Docker + docker-compose (v1), optional K8s manifests (stretch) | Production-standard deployment unit |
| CI/CD | GitHub Actions | Free, ubiquitous, easy to show in a portfolio |
| Monitoring | Prometheus + Grafana, or simpler: structured logs + a healthcheck endpoint | Shows production maturity |
| Dashboard | Metabase (fast to stand up) or a small custom React/Streamlit app | Streamlit is fastest if you want to build it yourself and show it off |
| Notifications | `python-telegram-bot`, `smtplib`/SendGrid | Matches earlier decision |
| Anti-bot handling | rotating user-agents, proxy pool (residential/datacenter proxy service), randomized delays, respect robots.txt | Necessary at multi-domain scale, and a legitimate automation-engineering topic to write about |

---

## 5. Data Model (Warehouse Layer)

Dimensional model — this is the part that specifically demonstrates data engineering competence:

**Dimension tables:**
- `dim_domain` (domain_id, name, base_url)
- `dim_region` (region_id, country_code, currency)
- `dim_category` (category_id, name)
- `dim_product` (product_id, domain_id, region_id, category_id, name, url, first_seen)

**Fact table:**
- `fact_price_snapshot` (snapshot_id, product_id, price, currency, price_usd_normalized, availability, checked_at, run_id, scraper_version)

**Why normalize price to USD (or one base currency):** cross-region price comparison is one of the more impressive analytics features you can demo ("same product, 4 regions, price trend over time") — but only works if currency is normalized at load time, not at query time.

**Data quality table:**
- `dq_scraper_health` (target_id, run_id, status, error_type, checked_at) — track parser failures separately from price data so a broken selector shows up as an operational alert, not a fake $0 price point.

---

## 6. Build Phases

### Phase 0 — Foundation (bare metal, no infra)
- Single Playwright script, one domain, one region, one category, hardcoded.
- Get price extraction reliably working before anything else.

### Phase 1 — Structured targeting
- Move to the `(domain, region, category)` target model, backed by Postgres instead of YAML (YAML doesn't scale past a handful of targets).
- Build the selector-resolution layer.

### Phase 2 — Pipeline separation
- Split into fetch → raw storage → parse → warehouse stages.
- Implement the dimensional schema.
- Add data-quality tracking table.

### Phase 3 — Orchestration at scale
- Introduce Celery + Redis for the worker pool.
- Add per-category/domain check-interval scheduling.
- Implement retry/backoff and dead-letter handling for failed jobs.

### Phase 4 — Resilience & anti-bot
- Proxy rotation, user-agent rotation, randomized pacing.
- Selector-break detection (alert when a parser returns null/anomalous data across a threshold of consecutive runs).
- Circuit breaker per domain (stop hammering a domain that's blocking you).

### Phase 5 — Notifications & alerting
- Threshold-based price-drop alerts (Telegram + email).
- Separate "operational alert" channel for scraper health vs "product alert" channel for price drops.

### Phase 6 — Analytics & dashboard
- Cross-region/category price trend views.
- Historical low/high tracking.
- This is the single highest-leverage feature for the "data automation engineer" narrative — a recruiter can see actual insight generated from the pipeline, not just raw scraping.

### Phase 7 — Productionization
- Dockerize all components, docker-compose for local, optional K8s manifests.
- GitHub Actions: lint → unit test → integration test (against recorded HTML fixtures) → build image → push.
- Structured logging (JSON logs) + Prometheus metrics endpoint (jobs run, success/fail rate, avg latency per domain).
- Secrets via environment/Docker secrets, never hardcoded.
- README with architecture diagram, setup instructions, and a "why I built it this way" section.

---

## 7. Testing Strategy

- **Unit tests** for each parser using saved HTML fixtures (don't hit live sites in CI — record a snapshot once, test against it).
- **Contract tests** for the normalization layer (currency conversion, price parsing edge cases like "$1,299.00" vs "1.299,00 €").
- **Integration test** for the full pipeline using a mock target against a local test server.
- **Data quality tests** — assert no negative prices, no currency mismatches, no duplicate snapshots per run.

---

## 8. Repo Structure

```
watchdog/
├── workers/
│   ├── fetcher/            # Playwright fetch logic
│   ├── parsers/             # one module per (domain, region) selector profile
│   └── tasks.py              # Celery task definitions
├── pipeline/
│   ├── normalize.py          # currency/price normalization
│   ├── loader.py              # writes to warehouse
│   └── quality_checks.py
├── warehouse/
│   ├── schema.sql
│   └── migrations/            # Alembic
├── notifier/
│   ├── telegram.py
│   └── email.py
├── dashboard/                  # Streamlit or Metabase config
├── scheduler/
│   └── beat_schedule.py
├── tests/
│   ├── fixtures/                # saved HTML snapshots
│   └── unit / integration
├── infra/
│   ├── docker-compose.yml
│   ├── Dockerfile.worker
│   ├── Dockerfile.scheduler
│   └── k8s/                     # stretch
├── .github/workflows/ci.yml
└── README.md
```

---

## 9. Portfolio Presentation Checklist

- [ ] Architecture diagram (the one above, cleaned up) in the README
- [ ] A short write-up: "Why raw/staged/warehouse separation matters" — shows data engineering judgment, not just scraping know-how
- [ ] A live or recorded demo of the dashboard showing real cross-region price trends
- [ ] CI badge on the repo (green build = credibility)
- [ ] A section on anti-bot/ethics: rate limiting, robots.txt respect, no ToS violations — shows engineering maturity, not just "I can scrape anything"
- [ ] Metrics from actually running it (e.g., "tracks N products across M domains/regions, X% uptime, Y alerts sent") — real numbers beat generic descriptions

---

## 10. Suggested Immediate Next Step

Start at Phase 0 regardless of how large the end architecture is — get one product, one domain, reliably scraped and stored before building any queue/orchestration layer around it. The full architecture above is the *destination*, not the starting point.
