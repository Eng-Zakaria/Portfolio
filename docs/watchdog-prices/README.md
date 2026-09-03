# 🐕 Watchdog - Multi-Domain Price Intelligence Platform

A production-grade, multi-domain e-commerce price intelligence platform that demonstrates senior-level skill as both an **Automation Engineer** (browser automation, orchestration, resilience, anti-bot handling) and a **Data Automation Engineer** (ETL pipeline design, dimensional data modeling, data quality, analytics).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AIRFLOW (Pipeline Orchestration)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ fetch_batch  │→ │parse_normalize│→ │ load_warehouse│→ │data_quality │  │
│  │    _task     │  │    _task     │  │    _task     │  │  _check_task │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                                                            │       │
│         ▼                                                            ▼       │
│  ┌──────────────┐                                           ┌──────────────┐│
│  │  Trigger    │                                           │   Alert     ││
│  │  Celery     │                                           │   Engine    ││
│  └──────────────┘                                           └──────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CELERY + REDIS (Task Execution)                     │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                     Worker Pool (Playwright Browsers)               │     │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │     │
│  │  │Worker 1 │  │Worker 2 │  │Worker 3 │  │Worker 4 │  │Worker N │ │     │
│  │  │Scrape   │  │Scrape   │  │Scrape   │  │Scrape   │  │Scrape   │ │     │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │     │
│  └────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RAW SNAPSHOT STORE                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │   data/raw/YYYYMMDD_HHMMSS_<hash>.html                              │   │
│  │   - Timestamped raw HTML snapshots                                    │   │
│  │   - Preserved for re-parsing after parser fixes                      │   │
│  │   - Never discarded after successful scrape                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      POSTGRES (Dimensional Data Warehouse)                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │ dim_domain │  │dim_region  │  │dim_category│  │dim_product │             │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘             │
│  ┌────────────┐  ┌──────────────────────┐  ┌─────────────────┐            │
│  │dim_parser  │  │      targets         │  │fact_price       │            │
│  │  _profile  │  │ (product×domain×region)│  │_snapshot       │            │
│  └────────────┘  └──────────────────────┘  └─────────────────┘            │
│  ┌───────────────────────────────────────────────────────────────────┐    │
│  │                     dq_scraper_health                             │    │
│  │                     (operational metrics)                          │    │
│  └───────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATIONS & DASHBOARD                          │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐    │
│  │   Telegram Bot    │  │   Email (SMTP)     │  │  Streamlit        │    │
│  │   Price Alerts   │  │   Price Alerts     │  │  Analytics        │    │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### Phase 0-1: Foundation & Structured Targeting
- ✅ Playwright-based browser automation with headless Chrome
- ✅ Postgres-backed `targets` table keyed by `(domain, region, category)`
- ✅ Selector-resolution layer: `(domain, region) -> parser profile`
- ✅ CLI for add/list/deactivate targets

### Phase 2: ETL Pipeline
- ✅ **Fetch**: Raw HTML/JSON to persistent storage
- ✅ **Parse/Normalize**: Price, currency, availability extraction
- ✅ **Load**: Dimensional warehouse schema
- ✅ Price normalization to USD base currency

### Phase 3: Orchestration at Scale
- ✅ Celery + Redis worker pool (horizontally scalable)
- ✅ Per-category/domain configurable check intervals
- ✅ Dead-letter handling with retry/backoff
- ✅ Airflow DAG with all 6 stages
- ✅ Backfill support for re-parsing historical snapshots

### Phase 4: Resilience & Anti-Bot Handling
- ✅ Rotating user-agents
- ✅ Randomized request pacing
- ✅ Selector-break detection (N consecutive nulls → alert)
- ✅ Per-domain circuit breaker
- ✅ robots.txt compliance ready

### Phase 5: Notifications
- ✅ Telegram bot integration
- ✅ Email (SMTP) integration
- ✅ Common `Notifier` interface
- ✅ Price-drop vs operational-health alert channels
- ✅ Configurable per-target thresholds

### Phase 6: Analytics Dashboard
- ✅ Price trend over time per product
- ✅ Cross-region price comparison
- ✅ Historical high/low tracking
- ✅ Scraper health metrics

### Phase 7: Productionization
- ✅ Docker + docker-compose for all components
- ✅ GitHub Actions CI (lint → test → build)
- ✅ Structured JSON logging
- ✅ Prometheus metrics endpoint ready
- ✅ Secrets via environment variables

## Quick Start

### Prerequisites
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker)
- Redis 7+

### Installation

```bash
# Clone and setup
git clone <repository>
cd watchdog-prices

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install --with-deps chromium

# Copy environment file
cp .env.example .env
# Edit .env with your configuration
```

### Docker Compose (Recommended)

```bash
cd docker
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Manual Setup

```bash
# Initialize database
python -m src.cli init

# Add a domain
python -m src.cli domain add amazon.com --display-name "Amazon"

# Add a region
python -m src.cli region add US --country "United States" --currency USD

# Add a category
python -m src.cli category add electronics --name "Electronics"

# Add a parser profile
python -m src.cli parser add amazon.com css --price-selector ".a-price-whole"

# Add a target
python -m src.cli target add "Sony WH-1000XM5" amazon.com US \
  "https://amazon.com/sony-headphones" \
  --category electronics --threshold 10 --interval 60

# List targets
python -m src.cli target list
```

### Running Services

```bash
# Start Celery worker
celery -A src.tasks.celery_app worker --loglevel=info

# Start Celery beat (for periodic tasks)
celery -A src.tasks.celery_app beat --loglevel=info

# Start Airflow (in separate terminal)
airflow webserver --port 8080
airflow scheduler

# Start dashboard
streamlit run dashboard/app.py
```

## Project Structure

```
watchdog-prices/
├── src/
│   ├── __init__.py
│   ├── config.py           # Configuration management
│   ├── database.py         # SQLAlchemy models & schema
│   ├── parser.py           # Price normalization
│   ├── cli.py              # CLI interface
│   ├── scraper/
│   │   ├── __init__.py
│   │   ├── core.py         # Browser automation
│   │   └── phase0_basic_scraper.py
│   ├── tasks/
│   │   ├── celery_app.py   # Celery configuration
│   │   ├── scraper_tasks.py # Scrape tasks
│   │   ├── parse_tasks.py   # Parse tasks
│   │   └── load_tasks.py    # Load tasks
│   └── notifications/
│       └── __init__.py      # Alert system
├── dags/
│   └── watchdog_pipeline.py # Airflow DAGs
├── dashboard/
│   └── app.py              # Streamlit dashboard
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── tests/
│   ├── test_parser.py       # Unit tests
│   ├── test_scraper.py     # Unit tests
│   ├── conftest.py         # Test fixtures
│   └── integration/
│       └── test_pipeline.py # Integration tests
├── data/
│   ├── raw/                # Raw HTML snapshots
│   └── processed/           # Processed data
├── .env.example            # Environment template
├── requirements.txt
├── README.md
└── CLAUDE.md
```

## Design Rationale

### Why Raw Storage Before Parsing?

The architecture **always persists raw HTML before parsing** for one critical reason: **selector bugs must never cause permanent data loss**.

Consider this scenario:
- You scrape Amazon for 6 months
- Amazon changes their CSS class from `.a-price` to `.price-block`
- Your parser returns null for all 6 months of NEW data

With raw storage:
- The raw HTML is preserved
- You write a parser fix
- Airflow backfill DAG re-parses all 6 months of historical data

Without raw storage:
- That 6 months of data is permanently lost

### Why Celery + Airflow?

**Celery** executes the actual scrape work — many small, frequent, independently-retryable per-target browser jobs. This is task-level execution.

**Airflow** orchestrates the pipeline as a whole — the DAG of dependent stages, scheduling, backfills, and providing a monitoring UI over pipeline health. This is pipeline-level orchestration, sitting above Celery, not replacing it.

A typical Airflow task (`fetch_batch_task`) triggers a group of Celery jobs and waits for their completion before the DAG proceeds to the next stage.

### Why Dimensional Schema?

A star schema with separate fact and dimension tables enables:
- **Historical analysis**: Snapshots are immutable facts
- **Slowly changing dimensions**: Product info can be updated without losing history
- **Efficient queries**: Denormalized fact table for fast analytics
- **Clean aggregations**: Dimension tables for grouping and filtering

## API Reference (Phase 8 Enhancement)

For REST API access to warehouse data, see `src/api/` (Phase 8 enhancement).

## Monitoring

- **Airflow UI**: `http://localhost:8080` (if using Airflow)
- **Flower**: `http://localhost:5555` (Celery monitoring)
- **Dashboard**: `http://localhost:8501` (Streamlit)
- **Prometheus**: `/metrics` endpoint on each service

## Troubleshooting

### Playwright not installing browsers
```bash
playwright install --with-deps chromium
```

### Database connection issues
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
psql -h localhost -U watchdog -d watchdog
```

### Celery worker not processing tasks
```bash
# Check Redis is running
docker-compose ps redis

# View Celery logs
docker-compose logs celery-worker
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure linting passes: `ruff check src/`
5. Run tests: `pytest tests/`
6. Submit a pull request

## License

MIT License - See LICENSE file for details.
