# Technical Specification: Waffarha Partner Price Integrity Pipeline

## 1. Executive Summary & Architecture Overview

The **Waffarha Partner Price Integrity Pipeline** is an automated, scheduled data pipeline designed to detect price violations by Waffarha's commercial partners. A violation occurs when a partner sells an equivalent product or service on their own website at a price lower than (or equal to) the voucher price on Waffarha, beyond a small configurable tolerance threshold (default: 2%).

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               PIPELINE STAGES                                      │
└───────────────────────────────────────────────────────────────────────────────────┘

 [ Stage 0: Audit ] ──► [ Stage 1: Ingest ] ──► [ Stage 2: Scope ]
  Reachability Pass       ClickHouse / Snapshot    URL Normalization
  (Weekly Cadence)        (DataSource)             Catalog Scoping
        │                        │                        │
        ▼                        ▼                        ▼
 ┌──────────────┐        ┌──────────────┐         ┌──────────────┐
 │ Partner      │        │ Active Offers│         │ Scrapable    │
 │ Triage List  │        │ & Tiers      │         │ Partner Sites│
 └──────────────┘        └──────────────┘         └──────────────┘
                                                          │
                                                          ▼
 [ Stage 6: Report ] ◄── [ Stage 5: Compare ] ◄── [ Stage 4: Scrape ]
  HTML / Excel /          Violation Rules &        Generic / Custom Adapters
  Markdown Outputs        Watch Tiers              (Stage 3: Tiered Matcher)
```

### Key Architectural Principles
- **Airflow First**: Designed with CLI entry points and atomic disk-backed artifacts per stage so tasks can be executed, retried, and monitored independently in Airflow DAGs.
- **Data Source Abstraction**: Decoupled ingestion layer allowing effortless switching from local JSON snapshots to ClickHouse queries.
- **Tiered Matching**: Multi-pass product/tier matching (`product_code` -> `fuzzy_text` -> `manual_override`).
- **Adapter Pattern for Scraping**: Standardized `PartnerScraper` interface with generic fallback (`requests` + `BeautifulSoup`) and Playwright execution for JS-rendered sites.
- **Per-Tier Independence**: Every offer variant/price tier (`type_price`) is evaluated independently.
- **Single Source of Truth Reporting**: Canonical result model that renders HTML, Excel, and Markdown reports.

---

## 2. Project Directory Structure

```
waffarha-partners-scrapper/
├── waffarha_price_integrity_agent_prompt.md   # Original requirements prompt
├── SPEC.md                                    # This specification document
├── config/
│   ├── settings.yaml                          # Default application configuration
│   └── partner_offer_url_overrides.json       # Manual offer-to-URL mappings
├── dags/
│   ├── waffarha_reachability_audit_dag.py     # Weekly Stage 0 audit DAG
│   └── waffarha_price_integrity_dag.py        # Daily/Scheduled Stages 1-6 DAG
├── src/
│   ├── __init__.py
│   ├── cli.py                                 # Unified Click/Typer CLI entrypoint
│   ├── config.py                              # Pydantic Settings & YAML loader
│   ├── models/
│   │   ├── __init__.py
│   │   ├── partner.py                         # Partner models & triage schemas
│   │   ├── offer.py                           # Offer & TypePrice models
│   │   ├── scrape.py                          # Scraped data & evidence models
│   │   ├── comparison.py                      # Match & Violation comparison models
│   │   └── report.py                          # Pipeline run result & summary schemas
│   ├── data_sources/
│   │   ├── __init__.py
│   │   ├── base.py                            # DataSource abstract base class
│   │   ├── json_snapshot.py                   # JSON snapshot implementation
│   │   └── clickhouse.py                      # ClickHouse DB implementation
│   ├── audit/
│   │   ├── __init__.py
│   │   └── reachability.py                    # Stage 0 reachability/feasibility classifier
│   ├── normalization/
│   │   ├── __init__.py
│   │   └── url_cleaner.py                     # Stage 2 URL cleaner & resolver
│   ├── matching/
│   │   ├── __init__.py
│   │   ├── base.py                            # Abstract Matcher interface
│   │   └── tiered_matcher.py                  # Code, fuzzy text, and override matcher
│   ├── scrapers/
│   │   ├── __init__.py
│   │   ├── base.py                            # Base PartnerScraper interface
│   │   ├── generic.py                         # Generic Static/BeautifulSoup scraper
│   │   ├── playwright_scraper.py              # Playwright dynamic scraper
│   │   └── adapters/                          # Per-partner custom scraper adapters
│   │       ├── __init__.py
│   │       └── sample_partner.py
│   ├── comparison/
│   │   ├── __init__.py
│   │   └── evaluator.py                       # Price gap & violation evaluator
│   └── reporting/
│       ├── __init__.py
│       ├── canonical.py                       # Result aggregator & canonical schema builder
│       ├── html_reporter.py                   # Jinja2 HTML report generator
│       ├── excel_reporter.py                  # OpenPyXL Excel report generator
│       └── markdown_reporter.py               # Markdown report generator
├── templates/
│   └── report.html.j2                         # Jinja2 template for HTML report
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── pyproject.toml                             # Dependencies & build configuration
└── README.md
```

---

## 3. Data Models & Schemas (Pydantic v2)

### 3.1 Partner & Triage Models (`src/models/partner.py`)

```python
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, HttpUrl

class TriageBucket(str, Enum):
    ONLINE_CATALOG = "online_catalog"       # Has scrapable online catalog/prices
    ONLINE_NO_PRICES = "online_no_prices"   # Has site/social, but no visible prices
    LOCAL_ONLY = "local_only"               # Physical branch only, no usable web presence
    BLOCKED = "blocked"                     # Has catalog but protected (CAPTCHA/403)
    DEAD_OR_INVALID = "dead_or_invalid"     # URL does not resolve or broken link

class Partner(BaseModel):
    part_id: int
    part_name_en: str
    part_name_ar: Optional[str] = None
    part_website: Optional[str] = None
    part_facebook: Optional[str] = None
    part_instagram: Optional[str] = None
    part_address_en: Optional[str] = None
    part_address_ar: Optional[str] = None
    status: str = "active"

class PartnerTriageResult(BaseModel):
    part_id: int
    partner_name_en: str
    partner_name_ar: Optional[str] = None
    bucket: TriageBucket
    urls_checked: List[str]
    http_status: Optional[int] = None
    reason: str
    checked_at: str  # ISO timestamp
```

### 3.2 Offer & Price Tier Models (`src/models/offer.py`)

```python
from typing import Optional, List
from pydantic import BaseModel, Field

class TypePrice(BaseModel):
    type_price_id: int
    offer_id: int
    type_price_name_en: str
    type_price_name_ar: Optional[str] = None
    type_price_price: float  # Actual voucher price for this tier

class Offer(BaseModel):
    offer_id: int
    part_id: int
    product_name: str
    product_code: Optional[str] = None
    actual_value: float       # Base voucher price (VAT-inclusive)
    offer_value: float        # Stated original value on Waffarha
    offer_discount: Optional[float] = None
    offer_brief_en: Optional[str] = None
    offer_brief_ar: Optional[str] = None
    offer_status: str = "active"
    offer_start_date: Optional[str] = None
    offer_expire_date: Optional[str] = None
    sub_category_ids: Optional[List[int]] = Field(default_factory=list)
    sold_coupons_count: int = 0
    type_prices: List[TypePrice] = Field(default_factory=list)
    data_source: str = "db"   # "db" or "json_snapshot"
```

### 3.3 Scraped Price & Evidence Models (`src/models/scrape.py`)

```python
from typing import Optional
from pydantic import BaseModel, HttpUrl

class ScrapedItem(BaseModel):
    partner_id: int
    item_title: str
    scraped_price: float
    currency: str = "EGP"
    is_vat_inclusive: bool = True
    normalized_price: float  # Currency/VAT normalized price
    exact_url: str
    scrape_timestamp: str    # ISO timestamp
    html_snapshot_path: Optional[str] = None
    screenshot_path: Optional[str] = None
    scraper_name: str        # e.g., "GenericScraper", "PlaywrightScraper"
```

### 3.4 Comparison & Violation Models (`src/models/comparison.py`)

```python
from enum import Enum
from typing import Optional
from pydantic import BaseModel

class MatchMethod(str, Enum):
    PRODUCT_CODE = "product_code"
    FUZZY_TEXT = "fuzzy_text"
    MANUAL_OVERRIDE = "manual_override"
    UNMATCHED = "unmatched"

class ClassificationTier(str, Enum):
    VIOLATION = "violation"                 # actual_value >= partner_site_price * (1 - tolerance_pct / 100)
    WATCH = "watch"                         # Near-miss just outside tolerance band
    CLEAR = "clear"                         # Voucher is cheaper
    UNMATCHED = "unmatched"                 # Product could not be matched
    UNVERIFIABLE = "unverifiable"           # Partner local-only, no-prices, or dead

class TierComparisonResult(BaseModel):
    offer_id: int
    type_price_id: Optional[int] = None
    tier_name: str                          # Tier name or "Base Offer"
    part_id: int
    voucher_price: float                    # actual_value
    partner_site_price: Optional[float] = None
    price_gap: Optional[float] = None       # voucher_price - partner_site_price
    price_gap_pct: Optional[float] = None   # price_gap / partner_site_price * 100
    classification: ClassificationTier
    match_confidence: float = 0.0           # 0.0 to 1.0
    match_method: MatchMethod = MatchMethod.UNMATCHED
    evidence_url: Optional[str] = None
    evidence_snapshot: Optional[str] = None
    notes: Optional[str] = None
```

### 3.5 Pipeline Run Result Model (`src/models/report.py`)

```python
from typing import List, Dict, Any
from pydantic import BaseModel
from src.models.partner import PartnerTriageResult
from src.models.comparison import TierComparisonResult

class RunSummary(BaseModel):
    run_id: str
    run_timestamp: str
    total_partners_audited: int
    online_catalog_partners: int
    total_offers_checked: int
    total_tiers_checked: int
    violations_count: int
    watch_count: int
    clear_count: int
    unmatched_count: int
    unverifiable_count: int
    tolerance_pct: float

class CanonicalPipelineResult(BaseModel):
    summary: RunSummary
    triage_results: List[PartnerTriageResult]
    comparison_results: List[TierComparisonResult]
    violations: List[TierComparisonResult]
    watch_list: List[TierComparisonResult]
    unverifiable_list: List[PartnerTriageResult]
```

---

## 4. Core Interfaces & Abstractions

### 4.1 Ingestion Abstraction (`src/data_sources/base.py`)

```python
from abc import ABC, abstractmethod
from typing import List
from src.models.partner import Partner
from src.models.offer import Offer

class DataSource(ABC):
    @abstractmethod
    def get_partners(self) -> List[Partner]:
        """Fetch partner master records."""
        pass

    @abstractmethod
    def get_active_offers(self, lookback_days: int = 30) -> List[Offer]:
        """Fetch active non-deleted offers with type_price variants and coupon volumes."""
        pass
```

### 4.2 Scraper Adapter Interface (`src/scrapers/base.py`)

```python
from abc import ABC, abstractmethod
from typing import List, Optional
from src.models.offer import Offer
from src.models.scrape import ScrapedItem

class PartnerScraper(ABC):
    @abstractmethod
    def can_handle(self, domain: str) -> bool:
        """Returns True if this scraper handles the given domain."""
        pass

    @abstractmethod
    def scrape_offer(self, partner_url: str, offer: Offer) -> Optional[ScrapedItem]:
        """Scrape product details/prices from a partner website."""
        pass
```

### 4.3 Matcher Interface (`src/matching/base.py`)

```python
from abc import ABC, abstractmethod
from typing import List, Tuple, Optional
from src.models.offer import Offer
from src.models.scrape import ScrapedItem
from src.models.comparison import MatchMethod

class BaseMatcher(ABC):
    @abstractmethod
    def match(
        self, offer: Offer, scraped_items: List[ScrapedItem]
    ) -> Tuple[Optional[ScrapedItem], float, MatchMethod]:
        """Matches an offer to scraped catalog items. Returns (matched_item, confidence, match_method)."""
        pass
```

---

## 5. Pipeline Stages Implementation Strategy

### Stage 0: Partner Reachability & Feasibility Audit
- **Goal**: Classify all `dim_partners` into the 5 buckets: `online_catalog`, `online_no_prices`, `local_only`, `blocked`, `dead_or_invalid`.
- **Approach**: Async HTTP client (`httpx`) to probe `part_website` and fallbacks (`part_facebook`, `part_instagram`).
- **Classification Logic**:
  - HTTP 403/429/CAPTCHA detected -> `blocked`
  - Connection error / DNS failure / 404 -> `dead_or_invalid`
  - Missing website & social links -> `local_only`
  - Page accessible but no commerce keywords/e-commerce signals -> `online_no_prices` or `local_only`
  - Detects product grid/JSON-LD/cart elements/price patterns -> `online_catalog`
- **Output**: Writes `triage_report.json` and `triage_report.csv` to the run directory.

### Stage 1: Ingestion
- **Implementations**:
  - `ClickHouseDataSource`: Queries ClickHouse via `clickhouse-connect`.
  - `JsonSnapshotDataSource`: Reads `offers_raw.json` and `type_prices.json`.
- **Deduplication & Prioritization**: Deduplicates by `offer_id` + `type_price_id` (latest `updated_at`), sorts by `sold_coupons_count` descending.

### Stage 2: Partner Website Normalization
- Normalizes URLs (e.g., prepends `https://`, strips UTM parameters, resolves shortlinks).
- Categorizes URL usability: `ok`, `dead`, `not_a_catalog`, `missing`.

### Stage 3: Tiered Product Matching
1. **Tier 1 - Exact `product_code` Match**: Checks scraped page metadata/SKUs against `offer.product_code` (Confidence: 1.0).
2. **Tier 2 - Manual Override`: Reads `partner_offer_url_overrides.json` keyed by `offer_id` (Confidence: 1.0).
3. **Tier 3 - Fuzzy Text Match**: Token set ratio via `rapidfuzz` on bilingual product title/brief against scraped titles. High confidence >= 0.85, Needs Review 0.60 - 0.84, Unmatched < 0.60.

### Stage 4: Scraping Engine
- **Generic Scraper**: Static HTTP fetching + BeautifulSoup parsing (schema.org JSON-LD, OpenGraph, fallback HTML selectors).
- **Playwright Scraper**: Headless browser automation for JS SPAs and infinite scrolls.
- **Resumability**: Scraped responses saved as JSON checkpoints in `<run_dir>/scraped_data/<partner_id>.json`.

### Stage 5: Price Comparison & Violation Rules
For each `type_price` tier:
- `is_violation = actual_value >= partner_site_price * (1 - tolerance_pct / 100)`
- `price_gap = actual_value - partner_site_price`
- `price_gap_pct = (price_gap / partner_site_price) * 100`

**Classification Bands**:
- **Violation**: `is_violation == True`
- **Watch List**: Not a violation, but `0 <= price_gap_pct < (tolerance_pct + 5.0)`
- **Clear**: `actual_value` is lower than partner price beyond watch threshold.
- **Unverifiable**: Partner not in `online_catalog` bucket.

### Stage 6: Reporting Engine
Renders reports from `CanonicalPipelineResult`:
- `report.html`: Interactive Jinja2 template with CSS styling, filter tabs, summary tiles, and violation severity sorting.
- `report.xlsx`: Multi-tab Excel workbook (`Summary`, `Violations`, `Watch List`, `All Comparisons`, `Audit Triage`).
- `report.md`: Markdown summary suitable for terminal inspection or documentation.

---

## 7. Airflow DAG Design (`dags/`)

Two independent, decoupled DAGs:

### DAG 1: `waffarha_reachability_audit_dag.py`
- **Schedule**: Weekly (`@weekly`)
- **Task**: Calls `python -m src.cli audit --output-dir /data/runs/audit_latest`
- **Output**: Shared triage JSON used by daily price-check runs.

```
 [ weekly_trigger ] ──► [ run_reachability_audit ] ──► [ persist_triage_artifact ]
```

### DAG 2: `waffarha_price_integrity_dag.py`
- **Schedule**: Daily (`@daily`)
- **Tasks**:
  1. `ingest_data`: Pulls active offers & joins with latest triage report.
  2. `normalize_and_scope`: Validates partner URLs.
  3. `scrape_partner_prices`: Runs scraping engine across `online_catalog` partners.
  4. `match_and_compare`: Matches products and evaluates price rules.
  5. `generate_reports`: Builds HTML, Excel, and Markdown reports.

```
 [ ingest_data ] ──► [ normalize_and_scope ] ──► [ scrape_partner_prices ]
                                                         │
                                                         ▼
 [ generate_reports ] ◄── [ match_and_compare ] ◄────────┘
```

---

## 8. Run Directory Layout

Each run creates a timestamped run folder under `runs/`:

```
runs/
└── run_20260825_120000_a1b2c3/
    ├── run_meta.json                  # Metadata (timestamps, config parameters)
    ├── triage_report.json             # Stage 0 reachability output
    ├── ingested_offers.json           # Stage 1 offer snapshot
    ├── scraped_data/                  # Stage 4 raw scrape checkpoints
    │   ├── partner_101.json
    │   └── partner_102.json
    ├── comparisons.json               # Stage 5 evaluated comparison results
    ├── canonical_result.json          # Unified canonical result object
    └── reports/                       # Stage 6 deliverables
        ├── price_integrity_report.html
        ├── price_integrity_report.xlsx
        └── price_integrity_report.md
```

---

## 9. Next Steps

1. **Setup Project Environment**: Initialize Python project with `pyproject.toml` and install core dependencies (`pydantic`, `httpx`, `beautifulsoup4`, `playwright`, `rapidfuzz`, `openpyxl`, `jinja2`, `click`).
2. **Implement Core Data Models**: Create `src/models/` Pydantic schemas.
3. **Implement Stage 0**: Build reachability classifier (`src/audit/reachability.py`).
4. **Implement Data Sources**: Create `DataSource` interfaces and snapshot loader.
5. **Implement Matcher & Comparator**: Build tiered matching logic and price comparison rules.
6. **Implement Scraper Engine**: Build generic scraper and partner adapter framework.
7. **Implement Reporting**: Create Jinja2 HTML, Excel, and Markdown renderers.
8. **Add Airflow DAGs**: Wire CLI entry points into Airflow tasks.
