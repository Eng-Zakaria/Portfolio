---
title: "Mapping Egyptian apparel wholesalers from public directories"
date: 2026-11-08
summary: "A freelance lead-collection pipeline that pulls clothing shops from public Egyptian business directories, resolves duplicates in Arabic, and exports per-governorate sales files. What it does, the guardrails in the code, and the ones that come next."
tags: [Web Scraping, Data Pipelines, Entity Resolution]
draft: false
---

*Evidence: Client (freelance), Sep–Oct 2026. The code is in a local folder with no git history and no public repository. Every number below comes from saved exports or the project's own experiment notes, counted in aggregate. No business records are reproduced here.*

## The problem

A client selling men's casual clothing at wholesale wanted a list of shops and wholesale offices across Egypt they could contact: shop name, area, governorate, and a phone number the business had published itself. The first idea on the table was "scrape Facebook and Instagram commenters". I ruled that out early, and that choice shaped the rest of the project.

People who comment "how much?" or "interested" under a wholesale post almost never include a phone number, and their profiles don't expose one publicly. Getting at those numbers would mean logging in, breaking platform terms, and harvesting personal data, which creates liability under Egypt's Personal Data Protection Law (Law 151 of 2020). Businesses, on the other hand, list themselves in public directories precisely so customers can find and call them. So the pipeline targets business listings, and treats social platforms as something you work with through manual exports, not live scraping.

## Architecture

The project is plain Python 3.13: `requests` for server-rendered pages, Playwright for one directory that needs a real browser, pandas and openpyxl for exports. There are no workers, queues or framework. Each source has its own collector script that writes a CSV in a shared column layout, plus a resumable progress file.

```text
 PUBLIC BUSINESS DIRECTORIES                      SOCIAL (manual export only)
 Yellow Pages EG (area catalogs)                  own FB Page / Group export JSON
 to-all.com, dalilmadina, EgypYello               Ad Library search URLs (opened by hand)
 buy.com.eg (JSON-LD), brand store pages          IG / TikTok export files
 QIZ garment-factory list (PDF)                          |
        |                                         phone_extractor (contact-hint gate)
        v                                         intent_collector: seller vs buyer
 per-source collector  -> shops_*.csv                    |
 (jittered delay, resume file)                           v
        |                                         SQLite: leads / buyer_intent
        v
 merge_governorates.py  (dedupe on phone+name, drop Cairo/Giza leaks)
        |
        v
 entity_resolution.build_canonical
   definitely same: shared phone | shared directory id
   probably same:   normalized Arabic name + same governorate
   uncertain:       same name, different areas -> review queue
        |
        v
 build_business_db.py -> businesses.csv/.xlsx, contacts.csv, review_queue.csv
```

Fields kept per business: name, normalized name, governorate, area, address, category, phone numbers, a WhatsApp link column, any Facebook/Instagram/TikTok page found on the business's own website, source and evidence URL, a verification status, and a member count. The factory list also carries a contact title per company, because that is how the source publishes it.

Two optional paths exist but were never run live. A Google Places adapter (`src/places_adapter.py`) reads its key from the environment and caches results; it was tested only in mock mode, so no money was spent. A Google Maps text-search collector exists for the same reason. None of the saved outputs come from Google Maps.

## Decision 1: business listings only, and a context gate for free text

For the social-export path, `extract_phones` only returns a number when the surrounding text contains a contact hint (WhatsApp, "call", "contact" and similar Arabic words) or a `wa.me` link. That keeps prices, dates and quantities out, and it limits capture to numbers someone posted as contact details:

```python
has_hint = bool(WHATSAPP_HINT.search(t) or "wa.me" in t)
if require_context and not has_hint:
    return []
```

Arabic-Indic digits are mapped to Western digits first, so `٠١١...` and `011...` normalize to the same thing. The unit tests cover exactly those cases, and they pass.

The intent collector splits the same exports into sellers (posts with a phone) and buyer intent (comments like "how much?"). Buyer-intent rows carry no phone. They do keep the commenter's username, the post URL and the comment text, though, and that is still personal data. The honest framing is "phone-free", not "personal-data-free".

The trade-off: the gate only applies to free text. The directory collectors keep whatever number the listing shows, which is reasonable because the listing exists for contact, but it means the gate isn't what protects most of the data.

## Decision 2: deterministic entity resolution with a review queue

The same shop shows up in several directories under different spellings. `normalize_name` folds alef and hamza variants, taa marbuta and alef maqsura, strips diacritics, and removes generic words like "shop", "office", "store" and "fashion". Clustering then runs as a union-find in three tiers:

| Tier | Signal | Action |
|---|---|---|
| Definitely same | shared normalized phone, or shared directory ID | merge |
| Probably same | same normalized name and same governorate | merge |
| Uncertain | same name across different areas (possible chain) | send to review queue, no auto-merge |

I chose rules over fuzzy matching or a model because a sales team has to trust the merge, and a rule is easy to explain when it is wrong. The cost is recall: two spellings that normalize differently stay as two businesses. A shared phone is a strong signal, but it can also join two different shops that list the same reseller's number, which is another reason the review file exists.

## Decision 3: pace requests and resume instead of going fast

Every collector waits between requests with random jitter (from about one second to over twenty, depending on the source and flags), saves state after each page, and can be stopped and resumed. Repeated HTTP errors trigger a longer pause. On the one directory behind Cloudflare, the project notes record a challenge after about two rapid page loads, so the Playwright collector runs slowly.

The project also has a written rule list of things that must not be automated: CAPTCHA solving, rate-limit evasion, logins or session reuse, personal-profile harvesting, and bulk messaging. A manual protocol covers phone numbers hidden behind a click-to-reveal button: a person opens the listing and copies the number the business published.

!!! note "Guardrails still to encode"
    Pacing and the opt-out list are in the code. Next: a robots.txt check per host, an identifying user-agent, stopping a source on its first challenge page (today the Playwright collectors retry in a fresh browser context), and keeping click-to-reveal manual, as the protocol says.

## Results

These figures come from the saved exports and experiment notes, counted in aggregate.

| Run (saved output) | Raw rows | Canonical businesses | With a phone | Review queue |
|---|---|---|---|---|
| Controlled batch, Yellow Pages Cairo/Giza (README, 2026-09-24) | 618 | 532 | 28 (5.3%) | 42 |
| Cairo/Giza + QIZ factories (`exports/`, 2026-09-28) | n/a | 2,557 | 1,780 | 114 |
| All governorates except Cairo/Giza (`exports_governorates/`, 2026-09-29) | 3,497 | 3,163 | 3,110 | 45 |

The non-Cairo/Giza file spans 25 governorate labels (24 governorates plus a "Delta" catch-all area that one directory uses) and 246 area values. By source it draws on Yellow Pages area catalogs (1,939 businesses), dalilmadina (842), EgypYello (318), a search-engine research pass (201) and one brand's store page (5). Some businesses appear in more than one source.

The phone-enrichment experiment was a useful negative result. Searching for each business's own website and reading its contact page, across a 200-business sample, added one verified number and three for review among the 157 businesses that had none (+0.6% verified). About 80% of the sample had no discoverable website. It became a secondary verification step, not a phone source.

Three data-quality items to fix in those exports:

- **Status labels overstate verification.** The build passes the same evidence type for every business with a phone, so any valid mobile is labelled "business-associated" regardless of source. Landlines fail the mobile-only check and are labelled "invalid" (767 rows in the governorates file), even though many are good business numbers.
- **WhatsApp is inferred.** The project's own rule says WhatsApp is never assumed from a mobile prefix, but the collectors build a `wa.me` link for every 11-digit mobile. That column means "is a mobile", not "uses WhatsApp".
- **No coordinates.** The `lat`/`lng` columns are empty in every merged file. The output is a per-governorate and per-area list, not a map. In the Cairo/Giza + QIZ file, the factory rows also put address fragments into the governorate column (461 distinct values), so that file needs cleaning before anyone groups by region.

## Lawful basis and consent

The phone numbers are business numbers published in business directories, but many Egyptian small businesses list the owner's personal mobile, and the factory list includes contact titles. Under Law 151/2020, a list like this should carry a recorded purpose, a source for every number, a way to honour "don't contact me", and a retention limit. The pipeline records the source and evidence URL, and keeps an opt-out list; recording purpose and retention is next. It also does no messaging: outreach templates exist for manual use, and nothing sends messages automatically.

## What I'd do next

1. **Encode the remaining guardrails:** robots.txt per host, an identifying user-agent with a contact address, stop on the first challenge page, click-to-reveal kept manual, and `collected_at` plus a retention date per contact.
2. **Fix the status logic:** pass the real evidence type per source, accept landlines, only fill the WhatsApp column when a page shows a WhatsApp link, and normalize governorate values against a fixed list of 27.
3. **Widen the tests** from phone extraction and the seller/intent split to entity resolution and the collectors' parsers.
4. **Map, if the client wants one:** geocode at area level from the address, or run the Places pilot (about $6 for 200 businesses by the project's own estimate) with a budget approved first.

## Links

- Case study: [Wholesale Radar case page](../projects/automative-scrapper.html)
- No public repository; this was a client project.
