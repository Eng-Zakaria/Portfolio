# Watchdog - Claude Code Instructions

This is the Claude Code project instructions file for Watchdog.

## Project Overview

**Watchdog** is a production-grade, multi-domain e-commerce price intelligence platform that demonstrates senior-level skill in both Automation Engineering and Data Automation Engineering.

## Key Files

| File | Purpose |
|------|---------|
| `src/database.py` | SQLAlchemy models, dimensional schema |
| `src/scraper/core.py` | Playwright browser automation |
| `src/parser.py` | Price normalization to USD |
| `src/cli.py` | CLI for managing targets |
| `src/tasks/*.py` | Celery tasks for scraping/parsing/loading |
| `dags/watchdog_pipeline.py` | Airflow DAG orchestration |
| `src/notifications/__init__.py` | Telegram + Email alerts |
| `dashboard/app.py` | Streamlit analytics dashboard |

## Architecture

- **Celery + Redis**: Task-level execution for individual scrape jobs
- **Airflow**: Pipeline-level orchestration (DAG of stages)
- **Postgres**: Dimensional data warehouse
- **Raw HTML Store**: `data/raw/` - always preserved before parsing

## Important Constraints

1. **Raw data never deleted after successful scrape** - enables backfill after parser fixes
2. **All prices normalized to USD** at load time
3. **Selector breaks trigger alerts** after N consecutive failures
4. **No live-site dependencies in tests** - use HTML fixtures

## Development Commands

```bash
# Initialize DB
python -m src.cli init

# Run tests
pytest tests/ -v

# Lint
ruff check src/

# Start dashboard
streamlit run dashboard/app.py
```

## Build Phases

Follow the phases in `watchdog-claude-code-prompt.md`. Each phase must be tested before moving to the next.
