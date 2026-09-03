# Waffarha Partner Price Integrity Pipeline

Automated pipeline to detect price violations by Waffarha's commercial partners. A violation occurs when a partner sells an equivalent product/service on their own website at a price lower than (or equal to) the voucher price on Waffarha, beyond a configurable tolerance threshold (default: 2%).

## Architecture

```
Stage 0 (Weekly)          Stages 1-6 (Daily)
┌─────────────────┐       ┌─────────────────┐
│ Reachability    │       │ Ingestion       │──► ClickHouse / JSON
│ Audit           │       │ (offers + tiers)│
└────────┬────────┘       └────────┬────────┘
         │                        ▼
         │                 ┌─────────────────┐
         │                 │ URL Normalize   │
         │                 │ & Scoping       │
         │                 └────────┬────────┘
         │                          ▼
         │                 ┌─────────────────┐
         │                 │ Scraping Engine │
         │                 │ (Generic +      │
         │                 │  Playwright)    │
         │                 └────────┬────────┘
         │                          ▼
         │                 ┌─────────────────┐
         └────────────────►│ Matching &      │
                           │ Comparison      │
                           └────────┬────────┘
                                    ▼
                           ┌─────────────────┐
                           │ Reporting       │
                           │ (HTML/Excel/MD) │
                           └─────────────────┘
```

## Pipeline Stages

| Stage | Description | Frequency | Output |
|-------|-------------|-----------|--------|
| **0** | Partner reachability audit - classifies all partners into 5 buckets | Weekly | `triage_report.json/csv` |
| **1** | Ingestion - fetch active offers with type_price tiers + coupon volumes | Daily | `ingested_offers.json` |
| **2** | URL normalization & catalog scoping | Daily | Integrated with Stage 4 |
| **3** | Tiered product matching (code → override → fuzzy) | Daily | Match confidence scores |
| **4** | Scraping engine (requests+BS4 / Playwright) | Daily | `scraped_data/partner_*.json` |
| **5** | Price comparison & violation classification | Daily | `comparisons.json` |
| **6** | Report generation (HTML, Excel, Markdown) | Daily | `reports/*.{html,xlsx,md}` |

## Violation Rule

```
is_violation = actual_value >= partner_site_price * (1 - tolerance_pct / 100)
```

- `tolerance_pct`: Configurable (default 2%)
- Also computes `price_gap = actual_value - partner_site_price` and `price_gap_pct`
- Classification tiers:
  - **Violation**: `is_violation == True`
  - **Watch**: Near-miss just outside tolerance band (`gap_pct` between `-tolerance` and `-(tolerance + watch_band)`)
  - **Clear**: Voucher meaningfully cheaper
  - **Unverifiable**: Partner has no online catalog

## Quick Start

### Installation

```bash
# Install dependencies
pip install -e ".[dev]"

# Install Playwright browsers
playwright install chromium
```

### Configuration

Copy `config/settings.yaml` to `config/settings.local.yaml` and adjust:

```yaml
# ClickHouse (production)
clickhouse_host: "your-ch-host"
clickhouse_username: "user"
clickhouse_password: "pass"

# Or use JSON snapshots for dev
offers_snapshot_path: "data/offers_raw.json"
type_prices_snapshot_path: "data/type_prices.json"
```

### Running Locally

```bash
# Full pipeline (all stages)
python -m src.pipeline_cli --stages 0,1,2,3,4,5,6

# Individual stages
python -m src.pipeline_cli --stages 0          # Reachability audit only
python -m src.pipeline_cli --stages 1,2,3,4,5  # Ingestion through comparison
python -m src.pipeline_cli --stages 6          # Report generation only

# Using CLI subcommands
python -m src.cli audit demo                   # Demo audit with mock data
python -m src.cli ingest run                   # Ingestion only
python -m src.cli report generate              # Generate reports from existing run
```

### Output Structure

Each run creates a timestamped directory:

```
runs/
└── run_20260825_120000_a1b2c3/
    ├── run_meta.json
    ├── triage_report.json          # Stage 0
    ├── ingested_offers.json        # Stage 1
    ├── scraped_data/               # Stage 4
    │   ├── partner_101.json
    │   └── partner_102.json
    ├── comparisons.json            # Stage 5
    ├── canonical_result.json       # Unified result
    └── reports/                    # Stage 6
        ├── price_integrity_report.html
        ├── price_integrity_report.xlsx
        └── price_integrity_report.md
```

## Airflow Deployment

Two DAGs are provided in `dags/`:

1. **`waffarha_reachability_audit_dag.py`** - Weekly (@weekly)
   - Runs Stage 0 reachability audit
   - Outputs triage report to shared location

2. **`waffarha_price_integrity_dag.py`** - Daily (@daily)
   - Loads triage report from weekly DAG
   - Runs Stages 1-6
   - Generates HTML, Excel, and Markdown reports

### Airflow Setup

```bash
# Set environment variables in Airflow
export WPI_CLICKHOUSE_HOST=your-host
export WPI_CLICKHOUSE_PASSWORD=your-password
export WPI_OUTPUT_BASE_DIR=/data/waffarha/runs

# Copy DAGs to Airflow DAG folder
cp dags/*.py $AIRFLOW_HOME/dags/
```

## Manual Overrides

For partners where automated matching fails, maintain `config/partner_offer_url_overrides.json`:

```json
{
  "partner_id:offer_id": {
    "url": "https://partner-site.com/exact-product-url",
    "note": "Manual mapping for specific offer"
  },
  "partner_id:offer_id:type_price_id": {
    "url": "https://partner-site.com/exact-tier-url",
    "note": "Tier-specific override"
  }
}
```

## Project Structure

```
waffarha-partners-scrapper/
├── config/
│   ├── settings.yaml                    # Default configuration
│   ├── settings.local.yaml              # Local overrides (gitignored)
│   └── partner_offer_url_overrides.json # Manual match overrides
├── dags/
│   ├── waffarha_reachability_audit_dag.py
│   └── waffarha_price_integrity_dag.py
├── src/
│   ├── cli.py                          # CLI entry points
│   ├── pipeline.py                     # Main pipeline orchestrator
│   ├── pipeline_cli.py                 # Standalone pipeline CLI
│   ├── config/settings.py              # Pydantic settings
│   ├── models/                         # Pydantic data models
│   ├── data_sources/                   # Data source abstractions
│   ├── audit/                          # Stage 0: Reachability
│   ├── normalization/                  # Stage 2: URL cleaning
│   ├── matching/                       # Stage 3: Tiered matcher
│   ├── scrapers/                       # Stage 4: Scraping engine
│   ├── comparison/                     # Stage 5: Price evaluation
│   └── reporting/                      # Stage 6: Report generators
├── templates/
│   └── report.html.j2                  # HTML report template
├── tests/
└── pyproject.toml
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Type checking
mypy src/
```

## License

Proprietary - Waffarha Data Team