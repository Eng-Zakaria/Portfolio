---
title: "Fail Open, Never Fail the Night: A Nightly Recommender Across GCP and AWS"
date: 2026-11-08
summary: "How a nightly job turns a day of customer events on Google Cloud Storage into fresh, active-offer recommendations in MySQL on AWS, and the one design rule that keeps it from ever waking the app up empty."
tags: [Data Engineering, Recommender Systems, Multi-Cloud]
draft: false
---

Every night at 00:00 Cairo time, a small service at Waffarha wakes up, reads what customers did
yesterday, and writes a fresh shortlist of offers for each of them. By the time the first customer
opens the app in the morning, their recommendations are already there.

This post walks through how that job works, and the one rule I'd keep if I had to throw everything
else away: **fail open, never fail the night.**

## The problem: three systems, one morning

The data needed for a recommendation lives in three places:

| What | Where | Owner |
|---|---|---|
| What customers viewed and searched | MoEngage event exports on **Google Cloud Storage** | Marketing |
| Which offers still exist | **ClickHouse** | Product data |
| What the app reads | **MySQL on AWS RDS** | Backend |

Nothing about this is exotic. What makes it tricky is that each system can be slow or down on any
given night, and the app shows whatever is in MySQL at 8 a.m., right or wrong.

## The pipeline

1. **Pull** the last day of JSON / NDJSON event exports from Cloud Storage and cache them locally.
2. **Keep** only two event types: offer views and search-result clicks on offers.
3. **Build histories**: sort each user's events by time, drop consecutive duplicates, keep the latest 50.
4. **Score similarity** between offers from co-views.
5. **Rank** each user's candidates with recency weights and drop offers that have expired.
6. **Upsert** the top picks into MySQL in batches of 5,000 rows.

### Similarity you can explain in one line

I used item-to-item collaborative filtering because it is easy to reason about and easy to debug
when someone asks "why did I get this offer?"

```python
from math import sqrt

def cosine(co_views: int, users_i: int, users_j: int) -> float:
    """Two offers are similar when the same people view both."""
    return co_views / sqrt(users_i * users_j)
```

Two guards keep it honest: an offer needs a **minimum number of users** before it gets neighbors,
so one shared click can't create a fake match, and each offer keeps only its **top 200** neighbors.

## The rule: fail open

The active-offer filter depends on ClickHouse. If ClickHouse is unreachable at midnight, there are two
choices:

- **Fail closed:** stop the job. The app wakes up with yesterday's recommendations, or none at all.
- **Fail open:** finish the batch without the filter and write fresh recommendations anyway.

I chose fail open. A list built from yesterday's behavior beats an empty one, and on most nights
ClickHouse is up and the filter runs.

!!! warning "The honest cost of failing open"
    On a night the filter is skipped, some recommendations can point at offers that have expired.
    My own review of the service flagged this: fail open is right for the batch, but wrong if the app
    assumes every recommendation is active. The fix I'd ship next is a status flag on the run, so the
    app knows when to double-check expiry itself, plus a loud alert instead of a quiet skip.

## Make re-runs boring

Nightly jobs get re-run, by schedulers and by tired humans. Two choices make that safe:

- **Upserts keyed on the user**, so a second run replaces the first instead of duplicating it.
- **A "run now" button that refuses to start** while another run is in flight.

## What's next

A second generation is already code-complete: purchase-based similarity, a content boost from recent
purchases, diversification so one merchant can't fill the list, and a trending fallback for new users.
Before it replaces the nightly job it needs one thing the first version never had: a saved offline
evaluation, so the switch is a measured decision and not a hunch.

---

*If you run nightly jobs that other teams depend on, I'd love to hear how you handle the night
something upstream is down. [Get in touch](../index.html#contact).*
