# Design Document: Waffarha Market Intelligence Pipeline

## 1. Problem Statement

Waffarha (Egypt's leading daily-deals platform) needs visibility into what customers are saying across public channels: app store reviews, social media, news, blogs, and forums. The goal is to build a **modular, maintainable pipeline** that:
- Ingests mentions from multiple sources
- Handles Arabic, English, and Arabizi (Arabic in Latin script)
- Provides sentiment and topic analysis
- Surfaces insights in a dashboard for product/marketing teams

## 2. Architectural Principles

### 2.1 Modularity First (Core Constraint)
> **Adding a new data source must mean writing one new adapter file, not touching ingestion, sentiment, storage, or the dashboard.**

Achieved through:
- **`SourceConnector` abstract base class** — single interface: `fetch_since(timestamp) -> list[RawMention]`
- **Connector registry** — auto-discovers all subclasses in `connectors/` via `pkgutil`
- **Normalized `RawMention` schema** — all sources emit identical structure
- **Source-agnostic pipeline stages** — language, sentiment, topics, storage operate only on normalized data

### 2.2 Configuration over Code
- All API keys, model names, flags in `.env` (loaded via Pydantic Settings)
- Connector enable/disable via config flags
- Search queries for web discovery in config

### 2.3 Idempotency
- Deduplication on `(source_name, external_id)` with text-hash fallback
- Database upserts (`ON CONFLICT`) — re-running pipeline never duplicates

### 2.4 Respect for Platform Policies
- `robots.txt` checking before fetching arbitrary URLs (web discovery)
- Rate limiting between requests
- Clear documentation of stubbed connectors requiring platform approval

## 3. Data Model

### 3.1 RawMention (Connector Output)
```python
@dataclass
class RawMention:
    text: str                    # Full mention text
    author: str                  # Author username/name
    date: datetime               # Publication date
    source_name: str             # "app_store", "google_play", "reddit", etc.
    url: str                     # Source URL
    raw_lang_guess: str          # Connector's rough guess: "arabic"/"english"/"arabizi"
    external_id: str             # Source-specific unique ID (for dedup)
    source_category: str         # "review", "social", "news", "web", "uncategorized"
```

### 3.2 Mention (Processed Fact Table)
```sql
CREATE TABLE mentions (
    id INTEGER PRIMARY KEY,
    source_name TEXT,           -- "app_store"
    external_id TEXT,           -- Source's unique ID
    text TEXT,                  -- Original text
    date TIMESTAMP,             -- Publication date
    language TEXT,              -- "arabic", "english", "arabizi", "unknown"
    sentiment_label TEXT,       -- "positive", "neutral", "negative"
    sentiment_score REAL,       -- -1.0 to 1.0
    topics TEXT,                -- JSON array: '["app_bugs", "pricing"]'
    url TEXT,                   -- Source URL
    source_category TEXT,       -- "review", "social", etc.
    processed_at TIMESTAMP
);
UNIQUE INDEX ON (source_name, external_id)
```

## 4. Pipeline Stages

### 4.1 Ingestion (`orchestrator.run_ingestion`)
1. Load enabled connectors from registry
2. For each: `connector.fetch_since(since)`
3. Convert to `PipelineMention` (in-memory processing model)
4. Deduplicate: primary key `(source_name, external_id)`, fallback text hash
5. Upsert to `raw_mentions` table

### 4.2 Language Detection (`language_detection.detect_language`)
**Priority:**
1. Arabic script > 30% → `arabic`
2. Arabizi heuristic → `arabizi`
3. Latin script > 50% → `english`
4. Else → `unknown`

**Arabizi Heuristic** (score ≥ 3):
- Latin ratio > 0.7 (+2), > 0.5 (+1)
- Number substitutions (3,7,5,6,9,2) present (+2)
- ≥2 common Arabizi words matched (+2), ≥1 (+1)
- Double vowel patterns (aa, ee, oo, uu) (+1)

### 4.3 Sentiment Analysis (`sentiment.analyze_sentiment`)
**Routing by Language:**
| Language | Model | Fallback |
|----------|-------|----------|
| Arabic | `aubmindlab/bert-base-arabertv02` | Multilingual → Keyword |
| English | `cardiffnlp/twitter-roberta-base-sentiment-latest` | Multilingual → Keyword |
| Arabizi | Transliterate → Arabic model | Multilingual → Keyword |
| Unknown | Multilingual (`xlm-roberta`) | Keyword |

**Output:** `SentimentResult(label, score, confidence)`

### 4.4 Topic Tagging (`topics.tag_topics`)
Rule-based keyword matching per language:
- **Topics**: `app_bugs`, `customer_service`, `pricing`, `wallet_security`, `offer_accuracy`, `delivery`, `other`
- Keywords defined for Arabic, English, Arabizi
- Returns all matching topics (multi-label)
- Extensible: `add_topic_keywords(topic, language, keywords)`

### 4.5 Storage (`storage.upsert_mentions`)
- Upsert processed mentions to `mentions` table
- Unique constraint on `(source_name, external_id)`

## 5. Connector Catalog

| Connector | Phase | Auth | Status | Notes |
|-----------|-------|------|--------|-------|
| App Store | 1 | None | ✅ | `app-store-scraper` |
| Google Play | 1 | None | ✅ | `google-play-scraper` |
| Google Business | 1 | Places API | ⚠️ Mock | Needs API key + Place ID |
| Reddit | 2 | OAuth | ✅ Stubbed | Needs Reddit app |
| News | 2 | None | ✅ | Google News RSS |
| Web Discovery | 2 | Bing API | ✅ Stubbed | Respects robots.txt, caches URLs |
| Facebook | 3 | Graph API | ❌ Stub | Requires Meta App Review |
| Twitter/X | 3 | Paid API | ❌ Stub | Requires X API Basic+ ($100/mo) |

## 6. Technology Choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Config | Pydantic Settings | Type-safe, .env support, validation |
| DB | SQLModel (SQLAlchemy) | SQL + Python models, easy Postgres swap |
| Language Det | Custom heuristic + `langdetect` | Arabizi needs custom logic |
| Sentiment | HuggingFace Transformers | SOTA models, multilingual support |
| Topics | Rule-based keyword matching | Explainable, fast, no training data needed |
| Dashboard | Streamlit + Plotly | Rapid prototyping, interactive |
| Logging | Loguru | Structured, file rotation |
| Testing | pytest | Standard, fixtures, parametrize |

## 7. Known Limitations & Trade-offs

### 7.1 Arabizi Handling
- **Detection**: Heuristic, not ML — false positives/negatives possible
- **Sentiment**: Basic transliteration → Arabic model; no validated Arabizi model exists
- **Mitigation**: Low confidence flag, human review queue for Arabizi

### 7.2 Phase 3 Connectors Stalled
- Facebook: Graph API requires **App Review** (weeks-months, not guaranteed)
- Twitter: API v2 requires **paid tier** ($100+/month)
- **Decision**: Scaffold interface only — document clearly, don't fake functionality

### 7.3 Web Discovery Connector
- Depends on **Bing Search API** (paid, free tier 1000/mo)
- Not a general scraper — uses search API, checks `robots.txt`, caches
- **Risk**: Search API results may not capture all mentions
- **Mitigation**: Document as supplementary, not exhaustive

### 7.4 Model Downloads
- First run downloads ~500MB models (transformers cache)
- **Mitigation**: Document in README, consider smaller models for CI

### 7.5 Rate Limiting
- Basic fixed delay (`RATE_LIMIT_DELAY`)
- No exponential backoff or sophisticated retry
- **Future**: Add `tenacity` retry with backoff per connector

### 7.6 Topic Tagger
- Keyword-based — misses context, sarcasm, negations
- **Future**: Train classifier on labeled data; keep rules as fallback

## 8. Extensibility Patterns

### Adding a New Connector
```python
# connectors/new_source.py
from .base import SourceConnector, RawMention
from datetime import datetime
from typing import List

class NewSourceConnector(SourceConnector):
    enabled_in_config = True
    def fetch_since(self, since: datetime) -> List[RawMention]:
        # ... fetch logic ...
        return [RawMention(...)]
```
No other files modified.

### Adding a New Topic
```python
# pipeline/topics.py
TOPIC_KEYWORDS["new_topic"] = {
    "arabic": {"كلمة1", "كلمة2"},
    "english": {"keyword1", "keyword2"},
    "arabizi": {"keyword1", "keyword2"},
}
```

### Swapping Database
Change `DATABASE_URL` in `.env` to Postgres — SQLModel handles dialect.

### Changing Sentiment Models
Update `ARABIC_SENTIMENT_MODEL` in `.env` — pipeline loads dynamically.

## 9. Deployment Considerations

### Local Development
- SQLite database in `data/market_intelligence.db`
- Run `python main.py run` periodically (cron) or on demand
- Dashboard: `python main.py dashboard`

### Production (Future)
- PostgreSQL for concurrent access
- Containerize with Docker
- Schedule via cron/Airflow/Prefect
- Dashboard behind auth (Streamlit auth or reverse proxy)
- Model caching volume for transformers
- Secrets via env vars / secret manager

## 10. Future Work (Prioritized)

1. **Arabizi Validation** — Collect human-labeled Arabizi samples, measure detection/sentiment accuracy
2. **Topic Classifier** — Train supervised classifier on labeled data, keep rules as fallback
3. **Alerting** — Slack/email notifications for sentiment spikes or new negative topics
4. **Historical Backfill** — One-time full-history fetch for trend analysis
5. **Competitor Tracking** — Extend connectors to monitor competitor mentions
6. **Advanced Dashboard** — Drill-downs, export, scheduled reports
7. **Web Discovery Enhancement** — Add SerpAPI fallback, improve snippet extraction

## 11. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-26 | SQLModel over raw SQLAlchemy | Type-safe models, easy migration |
| 2026-08-26 | Rule-based topics over ML | No labeled data, explainable, fast |
| 2026-08-26 | Arabizi heuristic over ML | No Arabizi training data available |
| 2026-08-26 | Bing Search API for web discovery | Not a scraper; respects robots.txt |
| 2026-08-26 | Phase 3 as stubs only | Platform approval uncertain, don't fake |
| 2026-08-26 | Streamlit for dashboard | Fast iteration, sufficient for MVP |
| 2026-08-26 | Loguru for logging | Structured, rotation, better than stdlib |

---
*Document version: 1.0*  
*Author: Waffarha Data Engineering Intern*  
*Last updated: 2026-08-26*