# Build Prompt: Waffarha Partner Price Integrity Pipeline

## Objective
Build a data pipeline that checks whether Waffarha's partners are violating their
partnership terms by pricing products/services on their **own website** lower than
(or equal to) the price customers pay through the **Waffarha voucher**. The pipeline
must produce a detailed report covering every partner and every offer checked.

**Violation rule (authoritative):**
> A violation occurs when `voucher_price` (the `actual_value` a customer pays on
> Waffarha) is **greater than or equal to** the price found for the equivalent
> product/service on the partner's own website (`partner_site_price`), **beyond
> a small configurable tolerance** — small gaps are expected noise (rounding,
> currency conversion artifacts, momentary price sync lag) and should not be
> reported as real violations.
>
> `tolerance_pct` is a config value (default: **2%** — the agent should make
> this easy to tune, since the right number may need adjusting after seeing
> real data).
>
> `is_violation = actual_value >= partner_site_price * (1 - tolerance_pct / 100)`
>
> Also compute and store `price_gap = actual_value - partner_site_price` and
> `price_gap_pct = price_gap / partner_site_price * 100` for every offer, even
> non-violations, so the report can show near-misses just outside the
> tolerance band (e.g. gap % between `tolerance_pct` and `tolerance_pct + 5`)
> as a "watch list" tier, distinct from confirmed violations.

## Data sources available (use these, do not re-derive from scratch)

1. **ClickHouse database** — primary source of truth. For now, DB access is
   **manual/one-time for dev purposes**: the existing fetch scripts currently
   live in a separate chatbot project and will be run by hand as needed while
   building this pipeline. Design the ingestion module with a clean interface
   (e.g. a `DataSource` abstraction) so that once those fetch scripts are
   separated out and this project is moved to scheduled fetching, swapping in
   the automated fetch is a drop-in change, not a rewrite. Relevant tables:
   - `main.dim_partners` — partner identity, `part_id`, `part_name_en/ar`,
     `part_website`, `part_address_en/ar`, `status`, contact info.
   - `main.dim_offers` — offer catalog, `offer_id`, `part_id`, `actual_value`
     (voucher price), `offer_value` (claimed original value shown on Waffarha),
     `offer_discount`, `product_name`, `product_code`, `offer_brief_en/ar`,
     `offer_status`, `offer_start_date`, `offer_expire_date`, `sub_category_ids`.
   - `main.dim_type_price` — offers can have multiple price tiers/variants
     (`type_price_id`, `type_price_price`, `type_price_name`) — each tier needs
     its own price check, not just the base offer price.
   - `main.fct_coupons` / `main.coupons_new` — actual sold coupons, useful for
     prioritizing which offers matter most (high `sold_coupons_count` /
     transaction volume = check first) and for historical `coupon_sold_price`.
   - `main.dim_date` — standard date dimension for trend/period filtering.

2. **JSON snapshots** (`offers_raw.json`, `type_prices.json`) — bilingual
   (en/ar) offer records, useful as a fallback or for fields not in the DB
   snapshot (e.g. richer `offer_brief`/title text for product-name matching)
   and for offline/dev testing without DB access.

3. **Live scraping target**: each partner's own website, from
   `dim_partners.part_website`. This field is inconsistent — validate/normalize
   URLs first (missing scheme, trailing paths, dead links, social-media links
   used instead of a real site) and log partners with no usable website
   separately (they can't be checked, they should still appear in the report
   as "unverifiable").

## Pipeline stages

### 0. Partner reachability & feasibility audit (run this first, for every partner)
Many partners are **local-only branches** (physical location, no real online
storefront) rather than online-sellable businesses, and we don't know upfront
which is which. Before any price scraping/matching work, the agent must run
an automated pass over **every partner in `dim_partners`** and classify how
(or whether) each one can be checked online. This audit is a deliverable in
its own right — produce it as a standalone report before moving on to price
comparison, since it determines the scope of everything downstream.

For each partner, automatically:
- Resolve and visit `part_website` (after the URL normalization described
  below) and any social links (`part_facebook`, `instagram`, etc.) as a
  fallback signal.
- Determine which bucket the partner falls into:
  - **`online_catalog`** — has a real product/service catalog or price list
    online (e-commerce site, menu page, booking system with prices) — scrapable.
  - **`online_no_prices`** — has a website/social presence but no visible
    prices (e.g. "contact us," Instagram-only menu, prices behind login) —
    not automatable, would need manual pricing or a different method.
  - **`local_only`** — no usable online presence at all (dead link, no
    website field, social page with no commerce info) — this partner is
    physical-branch-only and out of scope for automated scraping.
  - **`blocked`** — has a real online catalog but scraping is blocked
    (CAPTCHA, bot protection, requires login) — technically online but not
    automatable without extra work; flag for possible manual/API follow-up.
  - **`dead_or_invalid`** — the stored website/social URL doesn't resolve or
    points somewhere unrelated (bad data in `dim_partners`).
- Record, per partner: the bucket, the URL(s) checked, HTTP status/response
  notes, and a short reason (e.g. "Instagram bio only, no shop link," "site up
  but 403 on all requests," "no `part_website` value").

**Output of this stage**: a triage report (CSV/JSON + human-readable summary)
grouping all partners by bucket, with counts and a per-partner table, so it's
immediately clear which partners *can* be handled automatically (and by what
method — catalog scrape vs. blocked-needs-workaround) versus which are
local-only and structurally out of scope. This report should be reviewable
by a human before the pipeline proceeds — treat it as a checkpoint, not just
an internal log.

Only partners landing in `online_catalog` (and any `blocked` ones later
unblocked/handled manually) proceed to stages 1–6 below. Partners in
`local_only`, `online_no_prices`, and `dead_or_invalid` should still appear
in the final violation report, but explicitly marked as **not checked —
no online price available for comparison**, not conflated with "no violation
found."

### 1. Ingestion
- Pull active, non-deleted offers (`offer_status` not disabled/deleted,
  `offer_expire_date` in the future or within a configurable lookback window)
  joined with partner info and type-price variants.
- Fall back to the JSON snapshots when DB access isn't available, and clearly
  tag each record with its source (`db` vs `json_snapshot`) in the output.
- Deduplicate by `offer_id` + `type_price_id`, keep latest by `updated_at`.
- Prioritize by `sold_coupons_count`/coupon volume from `fct_coupons` — this
  determines scrape order, since we can't check everything at once.

### 2. Partner website normalization & scoping
- Clean/validate every `part_website` (add scheme, strip tracking params,
  resolve redirects, drop obviously non-catalog links like a bare Facebook
  page). Record `website_status`: `ok`, `dead`, `not_a_catalog`, `missing`.
- For each usable partner site, discover whether it has a real product/service
  catalog (menu, price list, booking page) worth scraping at all — some
  partners (e.g. spas, restaurants with no e-menu) may have no page to compare
  against. Tag these `no_comparable_page` in the report instead of silently
  skipping them.

### 3. Product/offer matching (the hard part — flag design decisions to the user)
This is the step most likely to need iteration, so build it as a clearly
separated, swappable module:
- Match each Waffarha offer (`product_name`, `product_code`, `offer_brief_en/ar`)
  to a specific page/listing on the partner's site.
- Use a tiered approach: exact `product_code` match first (rare but highest
  confidence) → fuzzy text match on product name/title (e.g. rapidfuzz/
  token-set-ratio) against scraped catalog item names → manual mapping file
  (`partner_offer_url_overrides.json`) that a human can maintain for partners
  where automated matching fails, keyed by `offer_id` → exact URL.
- Every match must carry a `match_confidence` score and `match_method`
  (`product_code`, `fuzzy_text`, `manual_override`, `unmatched`). Only
  `product_code` and `manual_override` (and fuzzy matches above a configurable
  high-confidence threshold) should feed into violation detection by default;
  lower-confidence matches go into the report as "needs review," not as
  confirmed violations — false positives here are reputationally costly.

### 4. Scraping engine
- Python, `requests` + `BeautifulSoup` for static/server-rendered pages,
  Playwright for JS-heavy sites (SPA menus, price shown after interaction,
  infinite scroll catalogs).
- Per-partner adapter pattern: a base `PartnerScraper` interface with a
  generic implementation, and the ability to drop in a partner-specific
  override when the generic one fails (site structures will vary widely
  across retail, F&B, beauty/spa, hotels — categories seen in `dim_offers`
  via `sub_category_ids`).
- Respect `robots.txt` and reasonable rate limits/backoff per domain; add a
  configurable per-domain request delay and concurrency cap. Log and skip
  (don't hard-fail the whole run) on blocked/CAPTCHA'd domains — flag those
  partners as `blocked` in the report rather than guessing.
- Store the raw scraped price, currency, scrape timestamp, and the exact URL
  used as evidence, plus (nice-to-have) a saved HTML snapshot or screenshot
  for audit/dispute purposes.
- Normalize currency/VAT: `actual_value` is confirmed always VAT-inclusive,
  consistently across partner categories — no per-category branching needed
  here. Still confirm the **scraped** partner-site price is also VAT-inclusive
  (this varies by site/category and isn't guaranteed), and normalize before
  comparing — an apples-to-oranges VAT mismatch would produce false violations.

### 5. Price comparison & violation classification
- Every `type_price` tier for a given offer is checked **independently** — an
  offer with 3 price tiers produces 3 separate comparison rows, each matched
  against its own equivalent listing/tier on the partner's site (not just the
  base/cheapest tier). Roll these up per-offer in the report (e.g. "2 of 3
  tiers in violation") in addition to listing each tier's own result.
- For every matched, high-confidence offer/type-price row: compute
  `is_violation`, `price_gap`, `price_gap_pct` per the rule above.
- Classify into tiers: `violation`, `watch` (just outside the tolerance band),
  `clear` (voucher meaningfully cheaper), `unmatched`/`unverifiable`
  (couldn't check).
- Cross-reference `sold_coupons_count`/revenue so the report can rank
  violations by business impact, not just count.

### 6. Reporting
Produce one run report containing, at minimum:
- **Summary**: partners checked, offers checked, violation count/rate,
  watch-list count, unmatched/unverifiable count, run timestamp.
- **Per-partner section**: partner name (en/ar), website status, contact info
  (from `dim_partners`), all their offers checked with per-offer voucher
  price, scraped site price, gap, gap %, match confidence/method, evidence
  link/screenshot, coupon volume.
- **Violations table**: sorted by severity (gap %) and/or business impact
  (coupon volume), for quick triage.
- **Watch list**: near-parity offers worth monitoring.
- **Unverifiable/blocked list**: partners that couldn't be checked and why
  (no website, dead site, blocked, no comparable page, no confident match) —
  important so this isn't mistaken for "no violation found."
- Output formats: **all three** — HTML, Excel, and Markdown — rendered from
  one shared structured result object per run (see "Confirmed decisions"),
  grouped by partner and by category in each format.
- Store all outputs on the **local filesystem**, one directory per run
  (timestamp/run-id in the path), so historical runs are never overwritten
  and trends over time can be tracked per partner — a partner who "fixes"
  pricing after being flagged, or who repeatedly violates, is a distinct
  signal from a first-time flag.

### 7. Scheduling
This pipeline is meant to **run on a schedule via Airflow**, not as a one-off
script. Build it so the whole flow (ingestion → reachability audit →
scraping → comparison → report) can be triggered by Airflow without manual
steps in between. Concretely:
- No interactive prompts mid-run; all inputs come from config/env, readable
  the same way whether invoked locally or from an Airflow task.
- Each run's outputs (raw scrape data, comparison results, reports) are
  written to a timestamped/run-id'd directory on local disk so scheduled runs
  don't clobber each other and history is preserved for trend tracking (see
  Reporting).
- Structure Stage 0 (reachability audit) and Stages 1–6 (ingestion → scraping
  → comparison → report) as separate Airflow tasks/task groups with their own
  schedules — the audit is expensive and the partner set changes slowly, so
  it should run on a slower cadence (e.g. weekly) and have its output cached/
  reused by the more frequent price-check runs, rather than re-running every
  time.
- Keep the pipeline logic itself (scraper, matcher, comparator, reporter) as
  plain, independently runnable/testable Python modules with CLI entry
  points — Airflow-specific code should live only in a thin `dags/` layer
  that wires those modules into tasks (e.g. `PythonOperator`/`BashOperator`).
  This keeps local dev and debugging possible without an Airflow environment.
- Alerting (Slack/email on new violations) is **not required for v1** — the
  report is the primary deliverable, but structure violation output so an
  alerting hook could be added as a later Airflow task without reworking the
  pipeline.

## Non-functional requirements
- Config-driven (env vars/config file) for: DB connection, scrape concurrency
  and delay, violation/watch thresholds, lookback window, output format/path,
  scheduling cadence per job.
- Idempotent, resumable runs (large partner list; scraping will be the
  bottleneck) — persist intermediate scrape results so a crash doesn't lose
  completed work.
- Logging of every skip/failure with a reason, since the report's credibility
  depends on being able to explain gaps, not just show numbers.
- Legal/ethical scraping hygiene: identify via a real User-Agent, honor
  `robots.txt`, back off politely, don't scrape logged-in/authenticated areas.

## Confirmed decisions (do not re-ask these)
1. `actual_value` is always VAT-inclusive, consistently across partner
   categories.
2. Each `type_price` tier is checked independently (see Stage 5).
3. A tolerance applies before flagging a violation — default **2%**,
   configurable (see the violation rule above).
4. This pipeline is scheduled, run repeatedly over time — not a one-off
   script (see Stage 7). Alerting is out of scope for v1.
5. DB fetch scripts currently live in a separate chatbot project and will be
   run manually/one-time for dev. Build the ingestion layer so switching to
   automated/scheduled DB fetching later is a drop-in change.
6. Report formats: generate **all three** — HTML, Excel, and Markdown — from
   the same underlying structured result (don't hand-maintain three separate
   renderers off divergent data; build one canonical result object/schema per
   run and have each format be a thin renderer over it).
7. Historical run outputs are stored on the **local filesystem**, one
   directory per run (timestamp/run-id'd, per Stage 6), no cloud storage or
   DB table needed for this.
8. Orchestration/scheduling is **Airflow**. Structure the pipeline as
   Airflow-friendly tasks from the start:
   - Stage 0 (reachability audit) and Stages 1–6 (ingestion → scraping →
     comparison → report) should be separate Airflow tasks/DAGs (or at least
     cleanly separable task groups) with their own schedules, per Stage 7.
   - Each stage should be a callable/task with clear inputs and outputs
     (files/paths on local disk), not one monolithic script, so Airflow can
     retry individual tasks (e.g. re-run just the scraping task) without
     re-running the whole pipeline.
   - Avoid Airflow-specific logic leaking into the core pipeline code (scraper,
     matcher, comparator, reporter) — keep those as plain, independently
     testable Python modules/CLI entry points, with a thin `dags/` layer that
     just wires them into Airflow operators (e.g. `PythonOperator` or
     `BashOperator` calling the CLI). This keeps local dev/testing possible
     without spinning up Airflow.
