# Project prompt: Waffarha Market Intelligence Pipeline

Copy everything below into Claude Code as your first message.

---

## Context

I'm a data engineering intern at Waffarha, an Egypt-based daily-deals platform (coupons, F&B, entertainment, travel). I want to build a **modular, scalable market intelligence pipeline** that pulls public mentions of Waffarha from multiple online sources, runs sentiment and topic analysis on them (Arabic + English + Arabizi), and surfaces the results in a simple dashboard so the product/marketing team can see what customers are saying and why.

This is a portfolio/internship project — it needs to be genuinely well-architected, not a one-off script, because the whole point is demonstrating I can design something the team could extend after I leave.

## Core requirement: modularity first

The single most important design constraint: **adding a new data source later must mean writing one new adapter file, not touching ingestion, sentiment, storage, or the dashboard.**

Concretely:
- Define one `SourceConnector` interface/abstract base class with a method like `fetch_since(timestamp) -> list[RawMention]`, where `RawMention` is a normalized dataclass: `{text, author, date, source_name, url, raw_lang_guess}`.
- Every data source (App Store reviews, Google reviews, Reddit, etc.) is implemented as its own connector class in its own file, registered in a connector registry (e.g. a `connectors/` directory with auto-discovery or an explicit registry list).
- The ingestion orchestrator loops over all registered connectors, calls `fetch_since()`, deduplicates, and writes normalized rows to one raw storage table — it must not contain any source-specific logic.
- Downstream stages (language detection, sentiment, topic tagging, storage, dashboard) operate only on the normalized schema and must be completely source-agnostic.

## Sources to implement, in this order

**Phase 1 (build and fully wire up first):**
1. App Store reviews for Waffarha (use a library like `app-store-scraper` or similar; no auth needed)
2. Google Play reviews for Waffarha (`google-play-scraper` or similar)
3. Google Business reviews (via Google Places API if a key is available — otherwise stub the connector with clear TODOs and mock data)

**Phase 2 (build connector classes and register them, but it's fine if I need to add my own API keys before they run for real):**
4. Reddit mentions (via PRAW / Reddit API) — search for "Waffarha" and related terms
5. News/blog mentions (Google News RSS or a news search API)
6. **General web discovery connector** — a broader "search the open web for Waffarha mentions" connector, not tied to one site. This should cover things like:
   - Coupon/deal aggregator sites that might list or compare Waffarha (e.g. sites that index deal platforms)
   - Online shopping / e-commerce blogs and "best savings apps in Egypt" style roundup articles
   - Forums and Q&A sites (e.g. Reddit already covered separately, but also things like Egyptian forums, Yahoo/Quora-style Q&A) where Waffarha comes up in discussion
   - General blog posts or comparison articles mentioning Waffarha alongside competitors

   Implementation approach for this connector — **use a search API, do not build a general-purpose scraper**:
   - Query a search API (e.g. Bing Web Search API, SerpAPI, or a similar programmatic search provider — pick one with a free/cheap tier) with a rotating set of queries: `"Waffarha"`, `"وفرها"`, `"Waffarha review"`, `"Waffarha vs"`, `"best deal apps Egypt"`, `"Waffarha complaint"`, etc.
   - For each result URL, fetch the page content (respecting `robots.txt` — check it before fetching, skip disallowed paths) and extract the surrounding text mentioning Waffarha, not the whole page.
   - Store the source domain so results can later be filtered/grouped by site type (aggregator, blog, forum, news, etc.) — add a `site_category` field, inferred from a simple domain keyword match or left as `uncategorized` for manual review.
   - Rate-limit requests and cache fetched URLs (by URL hash) so re-runs don't re-fetch unchanged pages.
   - This connector returns the same normalized `RawMention` shape as every other connector — no special-casing downstream.
   - Document clearly in the README: this connector depends on a paid/rate-limited search API, and respects each site's `robots.txt` — it is not a general scraper and should not be pointed at sites that disallow it.

**Phase 3 (stub only — these need app review / paid access, don't implement real logic, just scaffold the interface and document the access requirement in a comment):**
7. Facebook Page comments (Graph API — requires app review)
8. X/Twitter mentions (API is paid/tiered)

Do not spend real effort making Phase 3 connectors functional — just make sure the interface contract is respected so they can be filled in later.

## Pipeline stages

1. **Ingestion**: orchestrator calls all registered connectors, normalizes, deduplicates (by source + external ID or text hash), writes to a `raw_mentions` table.
2. **Language detection**: tag each mention as Arabic, English, or Arabizi (Arabic in Latin script) using a lightweight detection step (e.g. `langdetect` or `fasttext`, plus a simple heuristic for Arabizi since standard detectors miss it).
3. **Sentiment analysis**: route by detected language to an appropriate model — a multilingual/Arabic-aware model for Arabic text (e.g. a HuggingFace model like CAMeL-BERT or a general multilingual sentiment model), a standard model for English, and a documented fallback strategy for Arabizi (e.g. simple transliteration before classification, or a separate bucket if accuracy is too low). Output both a raw score and a 3-class label (positive/neutral/negative).
4. **Topic tagging**: tag each mention with one or more topics relevant to a deals platform — e.g. `app_bugs`, `customer_service`, `pricing`, `wallet_security`, `offer_accuracy`, `delivery`, `other`. Start with a simple keyword/rule-based tagger (fast, explainable, easy to extend) rather than training a classifier from scratch.
5. **Storage**: a clean warehouse-style schema — a `mentions` fact table (source, date, text, language, sentiment_label, sentiment_score, topics, url) that's easy to query for trends over time. SQLite is fine for local dev; structure the code so swapping in Postgres later is a config change, not a rewrite.
6. **Dashboard**: a simple, functional dashboard (Streamlit is fine) showing:
   - Sentiment trend over time, overall and by source
   - Topic breakdown (which issues are most common)
   - Sentiment x topic cross-tab (e.g. "which topics have the worst sentiment")
   - A feed of most recent negative mentions for quick triage

## Non-functional requirements

- **Config-driven, not hardcoded**: API keys, model names, connector enable/disable flags, and the web discovery connector's search query list should live in a `.env` / config file, not in code.
- **Respect robots.txt and rate limits everywhere**: any connector that fetches arbitrary web pages (the general web discovery connector especially) must check `robots.txt` before fetching and apply a sensible delay between requests to the same domain.
- **Idempotent runs**: re-running the pipeline should not duplicate data.
- **Basic logging**: each pipeline stage should log what it processed and any errors, not fail silently.
- **Tests**: at least basic unit tests for the connector interface contract (e.g. a test double connector) and for the sentiment/topic tagging logic on a handful of hand-labeled examples.
- **README**: explain the architecture, how to add a new connector (with a concrete example), how to run the pipeline end to end, and what's stubbed vs. fully implemented.
- **Design doc**: a short markdown doc explaining the architecture decisions (why this schema, why this connector pattern, known limitations like the Facebook/X access gap) — I'll use this to present the project internally.

## What I want from you (Claude Code)

1. Propose a concrete folder structure before writing code, so I can sanity-check it.
2. Scaffold the project: connector interface, the 3 Phase 1 connectors (with real working logic where no auth is required), ingestion orchestrator, storage schema, language detection, sentiment + topic tagging, and the dashboard.
3. Use Python. Prefer widely-used, well-documented libraries over exotic ones — this needs to be maintainable by whoever inherits it.
4. Write the README and design doc as you go, not as an afterthought.
5. After scaffolding, run the Phase 1 pipeline end-to-end on real Waffarha data (App Store + Google Play reviews) so I have a working demo, and show me a summary of what it found.
6. Flag any place where you had to make an assumption or take a shortcut, so I know what to revisit.

Start by proposing the folder structure and the `SourceConnector` interface, then proceed once I confirm.
