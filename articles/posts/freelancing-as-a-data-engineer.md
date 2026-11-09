---
title: "Freelancing as a data engineer in Cairo: clients, scoping, delivery"
date: 2026-11-09
summary: "What my freelance client work since January 2026 has taught me about scoping a data job, getting access to client data, handling personal data, and handing over something a client can trust."
tags: [Career, Freelancing, Data Engineering]
draft: false
sources:
  - CV/profile/MOHAMMED_ZAKARIA_PROFILE.md
  - Profile/Portfolio/index.html
  - CV/templates/Main_Resume_Template.tex
  - Profile/Portfolio/articles/posts/six-stage-client-etl.md
  - Profile/Portfolio/articles/posts/wholesale-radar-lead-mapping.md
  - Profile/Portfolio/articles/posts/one-warehouse-ten-clinics.md
---

I have been freelancing as a data engineer since January 2026, from Cairo and remotely, and since July 2026 I have done it alongside my role at Waffarha. This is a career reflection; the facts come from my CV and the project write-ups linked below. I won't talk about rates or client counts. What I can talk about is what the work itself showed me, including the problems I found and fixed.

## The work so far

My first client came through my network, which I think is how most freelance data work starts: someone who already knows how you work has a data problem. Three client jobs make up the core of my freelance record, and one earlier engagement shaped how I approached them.

| When | Client type | What I built | Write-up |
|---|---|---|---|
| 01/2025 – 01/2026 | Clinic network (at Nexlify, as an employee) | Airflow ETL from 10+ clinic sources into one star-schema warehouse, one Power BI model with a clinic switcher | [One warehouse, ten clinics](../articles/one-warehouse-ten-clinics.html) |
| 2026 | Multi-floor medical clinic | Six-stage Excel-to-PostgreSQL ETL into a star schema with bridge tables, MySQL loaders, a Power BI report design | [A 6-stage ETL for a paying client](../articles/six-stage-client-etl.html) |
| 2026 | Construction projects client | Python crawlers that collect construction data (contractor and tender datasets) into CSV/JSONL, with enrichment, dedup and validation | Not written up yet |
| 09/2026 – 10/2026 | Apparel wholesaler | Lead collection from public Egyptian business directories, Arabic entity resolution, per-governorate exports | [Mapping Egyptian apparel wholesalers](../articles/wholesale-radar-lead-mapping.html) |

The Nexlify work wasn't freelance, but it matters here. The patterns I reuse with clients today, like staged loads with a diff and a backup, bridge tables for staff with several roles, and scraping with enrichment and dedup, were first built there. Freelancing didn't start from zero. It started from things I had already seen work in production.

## Scoping: write down what actually arrives

I work from a written spec. Before I build, I hold meetings with the client, take notes, and turn them into a document we both agree on. The notes matter as much as the meetings: a decision that only exists in someone's memory will be remembered differently two weeks later.

The most useful scoping question I have learned to ask isn't "what do you want to see?" but "what exactly will you send me, and how often?"

On the clinic job, the answer was a whole Excel workbook every day, refreshed, not just the new rows. That one fact decided the design. A plain insert would have duplicated every order once a day, so the project needed a stable row key. I added an `Entry_ID` column to the client's sheet and fall back to a hash when it is missing. Staff names were free text, which meant an unknown name needed a human decision, so I built a review queue instead of auto-creating staff. Neither of those would have come out of a conversation about dashboards.

Scoping also means saying what you won't do. The apparel client's first idea was to scrape Facebook and Instagram commenters. I ruled that out early: those numbers aren't public, and collecting them would mean logging in, breaking platform terms and harvesting personal data. The project targeted business listings instead, which businesses publish so customers can call them. Narrowing the scope made the project smaller, but it also made it something I could defend.

What I'd tell someone starting out: put the input format, the refresh pattern, the key and the "won't do" list in the spec before you write code. Those decisions are cheap at the start and expensive to change later.

## Data access: assume the code and data stay with the client

On every client job so far, the code and data belong to the client. The clinic ETL has no public repo. The Nexlify warehouse has no repo I can link, and the before-and-after benchmark logs stayed with the client too. The ETL run log on the freelance clinic job contains personal data, so it is a source for my notes and is never published.

That has two practical effects.

First, I plan the portfolio side from day one. My write-ups use sanitized examples that show table and column names, aggregate counts, and code that doesn't reveal client data. I don't name the clients unless the site already does.

Second, I keep my own evidence as I go. Looking back at Nexlify, I report a 30% latency drop and zero dashboard timeouts, but I can't publish query plans to back them. My own takeaway in that write-up was to record timings and plans before and after each change as part of the work. On a freelance job, nobody else is going to keep that record for you.

## Privacy: the gap between rules and code

Client data in Egypt often means personal data: patient phone numbers on the clinic job, and owners' mobiles on business listings in the lead project. Egypt's Personal Data Protection Law (Law 151 of 2020) is the frame I work against.

The lead project is where I learned most here. It has a written list of things that must not be automated, and the phone extractor for free text only keeps a number when the text around it marks it as contact information. But when I reviewed the code against the README, I found a gap: the README mentioned suppression support, and the code had no opt-out list. A contact list has to be able to honour "don't contact me", so I added an opt-out list to the tool. The same review listed other next steps, like a robots.txt check and a recorded purpose and retention date per contact.

Two smaller lessons from the same job:

- **Watch your labels.** Buyer-intent rows carry no phone, but they keep usernames and comment text. "Phone-free" is accurate; "personal-data-free" would not be.
- **Don't let a status field overstate what you checked.** Every valid mobile got the label "business-associated" regardless of source, and WhatsApp links were built for every mobile number. Those columns said more than the pipeline knew.

What I'd tell someone starting out: write the privacy rules down, then check each one against the code before you hand over. Rules that live only in a document don't protect anyone.

## Handover: test the safety net with real data

Handover is where a client starts trusting your work without you in the room. On the clinic ETL, the staged design gave us something concrete to look at together: a dry-run report, four diff buckets (new, changed, unchanged, in the database but missing from today's file), and the unmatched-staff queue exported to CSV after each run. Those artefacts did more for trust than any dashboard.

The same job also showed me that a safety net you haven't tested isn't one. Two bugs came out of the first real runs:

```text
Backup:   output file opened before pg_dump runs
          -> pg_dump missing -> "skipped" logged, 0-byte .sql left behind
          -> looks like a restore point, isn't one

Rollback: one transaction, rollback() on a row error, no savepoint
          -> earlier rows discarded, counters keep counting them
          -> "rows processed" overstates what reached the database
```

I fixed both after the handover review. The lesson for delivery is broader than the two bugs: before handover, I now break each safety mechanism on purpose, for example by removing the backup tool or feeding in a bad row, and confirm it fails the way I think it does.

The first run also showed that a quality stage which doesn't mirror the database's own constraints is a partial check. 1,041 rows failed a `CHECK` constraint that the quality scan never looked at. Now I treat "every constraint has a matching quality rule" as part of done.

## Documentation is part of the deliverable

The clinic project ships with a `DOCUMENTATION.md` that covers, among other things, the Power BI patient-journey drillthrough as a design. At Nexlify, the source-to-warehouse mapping was a written artefact rather than logic buried in queries, and that is what kept a shared schema from drifting when a clinic changed a spreadsheet layout.

On a freelance job you will eventually leave, and the client keeps whatever you wrote down. The things I now treat as part of the handover:

- how to run it, and what "a good run" looks like in the log
- what each stage blocks and what it only warns about
- the known gaps, in plain words, so nobody discovers them in a report weeks later
- the rules for using the model safely, like which measures may cross a bridge table

## What I'd tell someone starting out

Freelance data work in Cairo, in my experience, is less about the stack than about the edges of the job: what arrives, who can see it, what you promised not to do, and what the client can check without you. Work from a written spec. Ask about the input before the output. Keep your own evidence. Make privacy rules executable. Break your safety nets before the client's data does. And write down the gaps, because an honest "this isn't done yet" is worth more to a client than a clean-looking handover that hides one.
