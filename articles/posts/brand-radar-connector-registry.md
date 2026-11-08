---
title: "Brand radar: one file per source and a connector registry"
date: 2026-11-08
summary: "How I built a pluggable pipeline that collects public mentions of Waffarha from app stores, Reddit, news and web search, routes Arabic and English text to different sentiment models, and tags each mention by business category."
tags: [Data Engineering, NLP, Python]
draft: false
sources:
  - Waffarha/waffarha-market-intelligence/README.md
  - Waffarha/waffarha-market-intelligence/DESIGN.md
  - Waffarha/waffarha-market-intelligence/BACKLOG.md
  - Waffarha/waffarha-market-intelligence/connectors/base.py
  - Waffarha/waffarha-market-intelligence/connectors/registry.py
  - Waffarha/waffarha-market-intelligence/connectors/news.py
  - Waffarha/waffarha-market-intelligence/connectors/reddit.py
  - Waffarha/waffarha-market-intelligence/connectors/web_discovery.py
  - Waffarha/waffarha-market-intelligence/pipeline/sentiment.py
  - Waffarha/waffarha-market-intelligence/pipeline/topics.py
  - Waffarha/PROJECT_SUMMARY_waffarha-market-intelligence.md
  - Profile/Portfolio/projects/market-intelligence.html
---

Evidence label: this is a working pilot, not a production system. It runs locally on SQLite, on demand, with a Streamlit dashboard. Several connectors need API keys that are not set, two are stubs, and the sentiment models have not been validated against labeled data. I describe what is built and say plainly where it stops.

## The problem

Waffarha is a daily-deals platform in Egypt. People talk about it in app store reviews, on Reddit, in the news and on the open web. Product and marketing wanted all of that in one place.

Two things made this harder than it sounds. The sources keep changing: libraries break, platforms add keys, new review sites matter. And the text is mixed. Egyptian users write in Arabic, in English, and in Arabizi (Arabic written in Latin letters, with digits like 3 and 7 standing in for Arabic sounds). A single English sentiment model would get a lot of it wrong.

So I set one rule in the design doc: a new data source means one new file, and nothing else changes.

## Architecture

The pipeline is a straight line:

connectors → ingestion (normalize, dedupe) → language detection → sentiment → topic tagging → storage → dashboard

Every connector emits the same record, a `RawMention` with text, author, date, source name, URL, a rough language guess, an external ID and a source category. Nothing downstream knows which site a mention came from.

Storage has two tables: `raw_mentions`, which holds the source data unchanged, and `mentions`, the processed fact table with language, sentiment label, a score from -1 to 1, and topics. Upserts are keyed on `(source_name, external_id)`, with a stable text hash as a fallback, so re-running the pipeline never duplicates rows.

Here are the sources the article title promises, and how each one is collected:

| Source | Method | Auth | Status | Cadence |
|---|---|---|---|---|
| App Store | iTunes RSS feed | None | Working | On demand; default window last 7 days |
| Google Play | `google-play-scraper`, English and Arabic streams | None | Working | On demand |
| Reddit | PRAW search over a fixed query list | OAuth app | Stubbed until keys are set | On demand |
| News | Google News RSS | None | Working | On demand |
| Web search | Bing Search API, robots.txt check, URL cache | Paid key | Disabled by default | On demand |
| Facebook, X | Not implemented | Platform approval / paid tier | Stub only | n/a |

There is no scheduler yet. The design doc lists cron, Airflow or Prefect as future production options. Today I run `python main.py run`, optionally with `--days` or `--since`.

## Decision 1: a registry instead of a list

The interface is one method. A connector takes a timestamp and returns a list of mentions. The registry walks the `connectors/` package with `pkgutil`, imports each module, and keeps an instance of every `SourceConnector` subclass it finds. Nothing has to be registered by hand.

Here is the idea in a minimal form. This is my own simplified sketch, not the project code:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
import importlib, pkgutil

@dataclass(frozen=True)
class Mention:
    text: str
    source: str
    external_id: str
    date: datetime

class Connector(ABC):
    enabled = True

    @abstractmethod
    def fetch_since(self, since: datetime) -> list[Mention]: ...

def discover(package) -> dict[str, Connector]:
    found = {}
    for info in pkgutil.iter_modules(package.__path__):
        try:
            module = importlib.import_module(f"{package.__name__}.{info.name}")
        except Exception:
            continue  # one broken file should not stop the rest
        for obj in vars(module).values():
            if isinstance(obj, type) and issubclass(obj, Connector) and obj is not Connector:
                found[info.name] = obj()
    return found
```

Two details mattered. A module that fails to import is logged and skipped, so one broken connector does not stop the run. And each connector can be switched off with an `ENABLE_<NAME>` flag on top of a class-level default; the stubs and web search default to off.

The trade-off is that "one file" is slightly generous. A new connector runs without touching anything else, but a config switch for it also needs an entry in the registry's flag map and the settings class. Auto-discovery also hides failures: a file with a typo just disappears from the run. That is why I added a `status` command that shows each connector as live, mock or disabled without network calls, plus per-connector metrics in the run summary.

## Decision 2: route sentiment by language

Language detection is a heuristic, not a model. If more than 30% of the characters are Arabic script, the mention is Arabic. Otherwise an Arabizi score is computed from Latin ratio, digit substitutions, common Arabizi words and doubled vowels, and a score of 3 or more marks it as Arabizi. Mostly-Latin text that does not look like Arabizi is English.

Sentiment then routes on that label:

- Arabic goes to `aubmindlab/bert-base-arabertv02`.
- English goes to `cardiffnlp/twitter-roberta-base-sentiment-latest`.
- Arabizi is crudely transliterated to Arabic and sent to the Arabic model, falling back to a multilingual XLM-RoBERTa model.
- Anything unknown goes to the multilingual model.

Each path falls back to a small keyword matcher if its model is missing or fails.

The upside is that each language gets a model trained on that kind of text, swappable with an environment variable. The cost: the models are about 500MB to download, and the README estimates transformers at roughly a day per 100k rows. So an offline switch, `WAFFARHA_SENTIMENT_OFFLINE=1`, skips the models and uses the keyword matcher. CI and bulk runs both use it.

!!! warning "What the sentiment numbers actually mean"
    The routing is in the code, but the existing case study is right to call model serving not yet implemented. Bulk runs use the keyword fallback, and the Arabic checkpoint is a base AraBERT model rather than one fine-tuned for sentiment. Treat the dashboard's sentiment labels as rough until the models are validated on labeled data.

The topic tagger has the same honesty problem. It is rule-based keyword matching in Arabic, English and Arabizi across 7 topics: the 6 business categories (app bugs, customer service, pricing, wallet security, offer accuracy, delivery) plus `other`. It is fast and explainable, and I had no labeled data to train anything else. It also misses negation. A made-up example: "this is not a pricing issue" would still get the `pricing` tag.

## Decision 3: official feeds and APIs over scraping

I preferred official or public feeds wherever they existed, and I left gated platforms as stubs instead of faking them.

The App Store connector is the clearest case. It first used a scraping library that had stopped working against Apple's current pages and returned 0 reviews. I replaced it with the iTunes RSS feed, which is official, keyless and paginated. That change, together with fixing a wrong store ID, took the App Store from 0 rows to 46 real reviews over 365 days.

Web search goes through the Bing Search API, not a crawler. Before fetching any page it checks `robots.txt`, and it caches URL hashes so it does not fetch the same page twice. The code comment is direct about it: it is not a general-purpose scraper. The cost is money. Bing is paid beyond a free tier of 1,000 calls a month, so the connector is off by default.

Facebook and X are stubs. Facebook needs Meta App Review, which can take weeks or months and is not guaranteed. X needs a paid API tier of $100 a month. I wrote the interface and documented the gap rather than scraping around the terms of service.

The trade-off is coverage. The radar sees less than a scraper would. I think that is the right default for a company tool, but the dashboard only shows what the enabled sources can reach.

## Results, with caveats

What exists today:

- 14 connector modules: Waffarha's own stores, competitor listings, review sites, Reddit, YouTube, news, web search, CSV import for manually exported social comments, and two stubs.
- Idempotent storage, with network calls retried 3 times with exponential backoff and jitter.
- A Streamlit dashboard with sentiment trends by source, a topic breakdown, a sentiment-by-topic heatmap, a recent-negative feed for triage, and a filterable table.
- A test suite where 120 unit tests pass in under a second in offline mode.

What it does not show:

- No accuracy numbers. Arabizi detection, Arabizi sentiment and the topic tagger have not been measured against labeled data.
- Google Business returns mock data without a key. Reddit returns nothing without OAuth credentials.
- Volume is limited by reality. Waffarha's own Play listing has about 19k reviews in total, so the original target of 500k mentions only works if you include competitor and category data.
- It is not in production. There is no scheduler, no auth on the dashboard and no Postgres deployment yet.

## What I'd do next

The backlog is ranked, and I agree with it.

First, label about 200 Egyptian review snippets and measure language detection, starting with Arabizi. Until then, the Arabizi bucket should not be trusted.

Second, add a negation window to the topic tagger, so "not", "no" or "مش" just before a keyword cancels the tag.

Third, store confidence scores and add a "needs review" filter for low-confidence rows.

Fourth, alert a chat webhook when the negative share jumps, reading the metrics line each run already writes.

Then label around 1k mentions and train a topic classifier, keeping the rules as a fallback, and swap in sentiment-tuned checkpoints.

[Get in touch](../index.html#contact).
