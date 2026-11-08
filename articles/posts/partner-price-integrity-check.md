---
title: "A 6-Stage Price-Integrity Check: Tolerance Bands, Fuzzy Matching, Resumable Scraping"
date: 2026-11-08
summary: "How a daily pipeline at Waffarha checks voucher prices against partners' own websites, and the three decisions that shape it: a tolerance band, conservative fuzzy-match thresholds, and when to use a headless browser."
tags: [Data Quality, Web Scraping, Airflow]
draft: false
sources:
  - Waffarha/waffarha-partners-scrapper/README.md
  - Waffarha/waffarha-partners-scrapper/SPEC.md
  - Waffarha/waffarha-partners-scrapper/config/settings.yaml
  - Waffarha/waffarha-partners-scrapper/src/matching/tiered_matcher.py
  - Waffarha/waffarha-partners-scrapper/src/comparison/evaluator.py
  - Waffarha/waffarha-partners-scrapper/src/models/comparison.py
  - Waffarha/waffarha-partners-scrapper/src/models/partner.py
  - Waffarha/waffarha-partners-scrapper/src/pipeline.py
  - Waffarha/waffarha-partners-scrapper/src/scrapers/registry.py
  - Waffarha/waffarha-partners-scrapper/src/scrapers/generic.py
  - Waffarha/waffarha-partners-scrapper/src/scrapers/circuit_breaker.py
  - Waffarha/waffarha-partners-scrapper/dags/waffarha_price_integrity_dag.py
  - Waffarha/waffarha-partners-scrapper/dags/waffarha_reachability_audit_dag.py
  - Waffarha/waffarha-partners-scrapper/docs/adr/0002-tiered-matching.md
  - Waffarha/waffarha-partners-scrapper/GAP_ANALYSIS.md
  - Waffarha/waffarha-partners-scrapper/PHASE_6_SUMMARY.md
  - Waffarha/PROJECT_SUMMARY_waffarha-partners-scrapper.md
  - Profile/Portfolio/projects/partner-price-integrity.html
---

This is a write-up of a production pipeline at Waffarha. It runs every day and checks whether a
partner is selling the same product or service on its own website for the same price as our
voucher, or less. I built it as a Data Engineer on the data team. Every number below comes from
the project's code, config, or design docs. Prices in the examples are made up.

## The problem: a voucher that isn't a deal

Waffarha sells vouchers for partners: gyms, restaurants, spas, retailers. The promise to the
customer is simple. The voucher should be cheaper than walking in or buying on the partner's site.

Sometimes it isn't. A partner runs a promotion on its own website, or quietly lowers a list price,
and our voucher ends up matching or beating nothing.

Checking this by hand doesn't work. There are hundreds of partners, and many offers have several
price tiers (a one-month and a three-month gym pass, say), each of which has to be checked on its
own. So the job is: for every active tier, find the equivalent item on the partner's site, read
its price, and decide whether the gap is a problem.

## The pipeline

The work is split into a weekly audit (Stage 0) and six daily stages. Each stage writes its output
to a timestamped run directory, so any stage can be re-run or inspected on its own.

| Stage | What it does | Frequency | Output |
|-------|--------------|-----------|--------|
| 0 | Reachability audit: sort every partner into one of 5 buckets | Weekly | `triage_report.json/csv` |
| 1 | Ingest active offers with their price tiers and coupon volumes | Daily | `ingested_offers.json` |
| 2 | Normalize partner URLs and scope catalog pages | Daily | Used by Stage 4 |
| 3 | Tiered matching: product code, then manual override, then fuzzy text | Daily | Match confidence scores |
| 4 | Scrape partner sites (requests + BeautifulSoup, or Playwright) | Daily | `scraped_data/partner_*.json` |
| 5 | Compare prices and classify each tier | Daily | `comparisons.json` |
| 6 | Write HTML, Excel, and Markdown reports | Daily | `reports/*` |

The reachability audit runs first for a reason. It classifies partners as `online_catalog`,
`online_no_prices`, `local_only`, `blocked`, or `dead_or_invalid`. Only `online_catalog` partners
get scraped. Everyone else is reported as Unverifiable instead of silently failing every day.

Two Airflow DAGs run it. The weekly DAG (`@weekly`, 1 retry, 10-minute delay) produces the triage
report. The daily DAG (`@daily`, 2 retries, 15-minute delay, `max_active_runs=1`) loads the latest
triage report and runs ingest, scrape, match-and-compare, and reporting as separate tasks.

Scraping is the fragile part, so it has the most guardrails. Partners are scraped concurrently,
5 at a time by default. Each partner gets 3 attempts with exponential backoff and jitter. A
per-domain circuit breaker opens after 5 consecutive failures and skips that domain for 3,600
seconds; those partners show up in the report under a sixth bucket, `circuit_open`, and their rows
are classified Unverifiable rather than Unmatched.

Each successfully scraped partner gets its own checkpoint file, `partner_<id>.json`. On a re-run of
the same run directory, the pipeline loads those files, skips partners that already have one, and
scrapes only the rest. Partners that failed are deliberately not checkpointed, so a retry picks
them up. Failed offers also go to a `dead_letters.json` file with the stage and the last error.

## Decision 1: a tolerance band, not an equality check

The core rule fits in one line:

```python
def classify(voucher_price, site_price, tolerance_pct=2.0, watch_band_pct=5.0):
    # No usable price on the partner site: nothing to compare.
    if site_price is None or site_price <= 0:
        return "unmatched"
    gap_pct = (voucher_price - site_price) / site_price * 100
    # Violation: voucher is not at least tolerance_pct cheaper than the site.
    if voucher_price >= site_price * (1 - tolerance_pct / 100):
        return "violation"
    # Watch: cheaper, but only by a small margin.
    if gap_pct >= -watch_band_pct:
        return "watch"
    return "clear"
```

A voucher that costs the same as the partner's site is a violation. So is one that's only
marginally cheaper. The default tolerance is 2%: the voucher has to be at least 2% below the site
price to pass.

Take an illustrative partner selling a class pack for 1,000 EGP on its site. The violation line
sits at 980. A voucher at 990 is a violation. A voucher at 960 is 4% cheaper, so it passes, but it
lands on the Watch list because a small price cut on the partner's side would flip it. A voucher
at 900 is Clear.

The trade-off is that the tolerance is a business choice dressed up as a parameter. Set it to zero
and you flag every rounding difference and every VAT-inclusive versus VAT-exclusive display. Set
it high and you excuse real undercutting. I made it config (`tolerance_pct`, `watch_band_pct`)
rather than code, so the commercial team can change it without a deploy.

The Watch tier matters as much as the rule. A pass/fail report hides offers that are one promotion
away from becoming a problem.

## Decision 2: fuzzy matching with conservative thresholds

Matching a Waffarha offer to the right item on a partner's site is the riskiest step. A wrong match
produces a wrong accusation, and that costs more with a partner than a missed check. The matcher
tries three tiers in order:

1. **Product code.** If the offer has a code and it appears in a scraped item's title, that's a
   match with confidence 1.0.
2. **Manual override.** A JSON file maps a partner and offer (optionally down to a single price
   tier) to an exact URL. Also confidence 1.0.
3. **Fuzzy text.** rapidfuzz's token-set ratio between the offer's name and its English and Arabic
   descriptions, against every scraped title.

Token-set ratio fits this data because partner titles and our offer text share words but rarely in
the same order or with the same filler. The thresholds are 0.85 for a confident match and 0.60 as
the floor; anything in between is meant to be "needs review," and anything below is unmatched.

The trade-off is recall. With 0.85 as the bar, a lot of genuinely equivalent items won't match on
text alone, especially when one side is in Arabic and the other in English. I accepted that. The
manual override file exists for exactly those cases, and it's cheap to maintain for the partners
that matter most.

!!! note "Where the code and the design disagree"
    The design doc says only high-confidence matches feed violation detection. In the current
    matcher, a match between 0.60 and 0.85 still returns a price, so it can be classified as a
    violation. The confidence and method are written on every row, so a reviewer can see it, but
    the gate itself isn't enforced yet.

## Decision 3: static scraping first, a headless browser when needed

There are two scraping backends. The generic one fetches HTML and parses it with BeautifulSoup,
trying schema.org JSON-LD first, then Open Graph product tags, then common HTML price patterns.
The second one drives headless Chromium through Playwright for sites that render prices with
JavaScript.

Static fetching is fast, cheap, and easy to debug, and JSON-LD gives clean prices. Its weakness is
single-page apps, where the downloaded HTML has no prices at all.

Playwright handles those, but it costs memory, CPU, and time per page, and it's the first thing to
fall over when you run many partners at once. The scraper registry picks a backend in order: a
partner-specific adapter if one is registered, then Playwright, then the generic scraper.

Here's the honest part. Playwright's handler currently claims every domain whenever it's enabled,
which it is by default. So in practice the static scraper is the fallback when the browser is
switched off, not a first attempt that escalates.

## Results and caveats

What the pipeline does today: it runs daily on Airflow, checks every price tier of every active
offer for partners with an online catalog, and produces one canonical result rendered as HTML,
Excel, and Markdown. The report separates Violation, Watch, Clear, and Unverifiable, and every row
carries the evidence URL, the match method, and the match confidence. The test suite is at 28
tests, with ruff, black, and mypy in CI.

What I can't claim: I don't have a measured violation count or a measured match precision to
share, so I'm not quoting one. A few gaps are written down in the project's own gap analysis:

- Checkpoints are written once the scraping stage finishes, not after each partner. A crash in the
  middle of Stage 4 loses that attempt's progress.
- There's no golden dataset yet, so a change to the thresholds or to rapidfuzz could shift
  classifications without a test catching it.
- Playwright runs a single shared browser with no memory cap or concurrency limit of its own.

## What I'd do next

- **Enforce the review band.** Matches between 0.60 and 0.85 should go to a review list, never
  straight to Violation.
- **Static first, then escalate.** Try the generic scraper, and only launch Playwright for a
  partner when the static pass finds no prices. Cache that decision per domain in the weekly audit.
- **Write checkpoints as partners finish.** Persist each partner's file as soon as its scrape
  completes, so a mid-stage crash costs one partner, not the whole stage.
- **Build the golden dataset.** A versioned set of offer/listing pairs with known answers, run in
  CI, so threshold changes show their effect before they ship.

[Get in touch](../index.html#contact).
