# Waffarha Market Intelligence Pipeline

A modular, scalable pipeline for monitoring public mentions of Waffarha (Egypt's daily-deals platform) across multiple online sources, with sentiment and topic analysis supporting Arabic, English, and Arabizi (Arabic in Latin script).

## Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────┐
│  Connectors     │────▶│  Ingestion   │────▶│  Language Detect │────▶│Sentiment │
│  (per source)   │     │  (dedupe,    │     │  (ar/en/arabizi) │     │ Analysis │
└─────────────────┘     │   normalize) │     └──────────────────┘     └──────────┘
                        └──────┬───────┘                                │
                               ▼                                        ▼
                        ┌──────────────┐     ┌──────────────────┐     ┌──────────┐
                        │   Storage    │◀───│  Topic Tagging   │◀────│  (per    │
                        │  (SQLite/    │     │  (rule-based,    │     │ language)│
                        │   Postgres)  │     │   multilingual)  │     └──────────┘
                        └──────┬───────┘     └──────────────────┘
                               ▼
                        ┌──────────────┐
                        │  Dashboard   │
                        │  (Streamlit) │
                        └──────────────┘
```

**Core Principle**: Adding a new data source = writing **one new connector file** in `connectors/`. No changes to ingestion, analysis, storage, or dashboard.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys (optional for Phase 1)
```

### 3. Run Full Pipeline (Phase 1 - App Store + Google Play + Google Business mock)
```bash
python main.py run
```

### 4. Launch Dashboard
```bash
python main.py dashboard
# Opens at http://localhost:8501
```

## Commands

| Command | Description |
|---------|-------------|
| `python main.py run` | Full pipeline: ingest → analyze → store |
| `python main.py ingest` | Fetch raw mentions only |
| `python main.py analyze` | Run language/sentiment/topics on stored raw data |
| `python main.py dashboard` | Launch Streamlit dashboard |
| `python main.py init-db` | Create database tables |

### Options
```bash
python main.py run --days 30        # Last 30 days (default: 7)
python main.py run --since 2026-01-01  # Since specific date
python main.py dashboard --port 8502   # Custom port
```

## Connectors

### Phase 1 (Fully Implemented, No Auth Required)

| Connector | Source | Status |
|-----------|--------|--------|
| `app_store` | App Store reviews (Egypt) | ✅ Working |
| `google_play` | Google Play reviews (Egypt) | ✅ Working |
| `google_business` | Google Business Profile reviews | ⚠️ Mock data (needs API key) |

### Phase 2 (Implemented, Requires API Keys)

| Connector | Source | Requires |
|-----------|--------|----------|
| `reddit` | Reddit mentions | Reddit API credentials |
| `news` | Google News RSS | None (RSS) |
| `web_discovery` | General web search | Bing Search API key |

### Phase 3 (Stubs Only - Require Platform Approval)

| Connector | Source | Status |
|-----------|--------|--------|
| `facebook` | Facebook Page comments | ❌ Needs Meta App Review |
| `twitter` | X/Twitter mentions | ❌ Needs X API paid tier |

## Adding a New Connector

1. Create `connectors/my_source.py`:
```python
from .base import SourceConnector, RawMention
from datetime import datetime
from typing import List

class MySourceConnector(SourceConnector):
    enabled_in_config = True  # or False to require explicit enable

    def fetch_since(self, since: datetime) -> List[RawMention]:
        # Your fetch logic here
        return [
            RawMention(
                text="...",
                author="...",
                date=datetime.now(),
                source_name="my_source",      # Unique source identifier
                url="https://...",
                raw_lang_guess="english",     # Rough guess: arabic/english/arabizi
                external_id="unique_id",      # For deduplication
                source_category="review",     # review/social/news/web
            )
        ]
```

2. That's it! The registry auto-discovers it. Run `python main.py run`.

## Configuration

All settings in `.env` (see `.env.example`):

- **API Keys**: `GOOGLE_PLACES_API_KEY`, `REDDIT_CLIENT_ID`, `BING_SEARCH_API_KEY`, etc.
- **Model Names**: `ARABIC_SENTIMENT_MODEL`, `ENGLISH_SENTIMENT_MODEL`
- **Pipeline**: `BATCH_SIZE`, `RATE_LIMIT_DELAY`
- **Connector Flags**: `ENABLE_APP_STORE`, `ENABLE_WEB_DISCOVERY`, etc.

## Pipeline Stages

### 1. Ingestion (`pipeline/orchestrator.py`)
- Loops over all enabled connectors from registry
- Calls `fetch_since(timestamp)` on each
- Normalizes to `RawMention` schema
- Deduplicates by `(source_name, external_id)` or text hash
- Stores in `raw_mentions` table

### 2. Language Detection (`pipeline/language_detection.py`)
- **Arabic**: Arabic Unicode script detected
- **English**: Predominantly Latin characters
- **Arabizi**: Heuristic — Latin script + Arabizi patterns (numbers for letters, common transliterations)
- Returns `Language` enum + confidence

### 3. Sentiment Analysis (`pipeline/sentiment.py`)
Routes by language:
- **Arabic**: `aubmindlab/bert-base-arabertv02` (Arabic BERT)
- **English**: `cardiffnlp/twitter-roberta-base-sentiment-latest`
- **Arabizi**: Transliterate → Arabic model, fallback to multilingual
- Output: label (positive/neutral/negative) + score (-1 to 1) + confidence

### 4. Topic Tagging (`pipeline/topics.py`)
Rule-based keyword matching (Arabic + English + Arabizi):
- `app_bugs` — crashes, errors, slow performance
- `customer_service` — support, help, response time
- `pricing` — price, wallet, balance, discounts
- `wallet_security` — fraud, scam, payment security
- `offer_accuracy` — misleading deals, invalid coupons
- `delivery` — shipping, courier, late/missing orders
- `other` — no matching keywords

### 5. Storage (`pipeline/storage.py`)
- **Raw table**: `raw_mentions` — immutable source data
- **Fact table**: `mentions` — processed with language, sentiment, topics
- SQLite default; swap to Postgres via `DATABASE_URL`
- Idempotent upserts on `(source_name, external_id)`

### 6. Dashboard (`dashboard/app.py`)
Streamlit dashboard with:
- Sentiment trend over time (overall + by source)
- Topic breakdown (bar chart)
- Sentiment × Topic cross-tab (heatmap)
- Recent negative mentions feed for triage
- Filterable data table

## Testing

```bash
# Run all tests
pytest tests/

# Run specific test file
pytest tests/test_language.py -v
pytest tests/test_sentiment.py -v
pytest tests/test_topics.py -v
pytest tests/test_connectors.py -v
pytest tests/test_deduper.py -v
```

## Project Structure

```
waffarha-market-intelligence/
├── .env.example           # Config template
├── requirements.txt       # Dependencies
├── main.py               # CLI entry point
├── config.py             # Pydantic settings
├── README.md             # This file
├── DESIGN.md             # Architecture decisions
├── connectors/           # Source-specific adapters
│   ├── base.py           # SourceConnector ABC + RawMention
│   ├── registry.py       # Auto-discovery registry
│   ├── app_store.py      # Phase 1
│   ├── google_play.py    # Phase 1
│   ├── google_business.py # Phase 1 (mock without API key)
│   ├── reddit.py         # Phase 2
│   ├── news.py           # Phase 2
│   ├── web_discovery.py  # Phase 2 (Bing Search + robots.txt)
│   ├── facebook.py       # Phase 3 (stub)
│   └── twitter.py        # Phase 3 (stub)
├── pipeline/             # Source-agnostic pipeline stages
│   ├── models.py         # SQLModel + dataclasses
│   ├── orchestrator.py   # Ingestion → Analysis → Storage
│   ├── storage.py        # SQLite/Postgres adapter
│   ├── deduper.py        # Deduplication logic
│   ├── language_detection.py  # ar/en/arabizi detection
│   ├── sentiment.py      # Language-routed sentiment
│   └── topics.py         # Rule-based topic tagger
├── dashboard/            # Streamlit dashboard
│   └── app.py
├── tests/                # Unit tests
│   ├── conftest.py
│   ├── test_connectors.py
│   ├── test_language.py
│   ├── test_sentiment.py
│   ├── test_topics.py
│   └── test_deduper.py
└── references/
    └── schema.sql        # SQL DDL reference
```

## Known Limitations & Assumptions

1. **Google Business**: Returns mock data without `GOOGLE_PLACES_API_KEY` and `GOOGLE_BUSINESS_PLACE_ID`
2. **Facebook/Twitter**: Stubs only — require platform approval/paid access
3. **Arabizi Detection**: Heuristic-based, not ML — may misclassify
4. **Arabizi Sentiment**: Transliteration is basic; accuracy not validated
5. **Web Discovery**: Requires Bing Search API (paid tier), respects `robots.txt`
6. **Models**: Download on first run (~500MB total for transformers models)
7. **Rate Limits**: Basic delay between requests; no sophisticated backoff yet

## Extending the Pipeline

### Add a New Topic
Edit `pipeline/topics.py` — add keywords to `TOPIC_KEYWORDS` dict.

### Swap to PostgreSQL
Set `DATABASE_URL=postgresql://user:pass@host:5432/db` in `.env`

### Use Different Sentiment Models
Change `ARABIC_SENTIMENT_MODEL`, `ENGLISH_SENTIMENT_MODEL` in `.env`

### Add Custom Connector Logic
Subclass `SourceConnector` — the registry handles the rest.

## License

Internal project for Waffarha market intelligence.