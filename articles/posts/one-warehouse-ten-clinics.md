---
title: "One warehouse, ten clinics: star schemas, bridge tables, zero BI timeouts"
date: 2026-11-08
summary: "How I designed a central warehouse for a network of 10+ clinics at Nexlify: one star schema, bridge tables for staff who hold several roles, and one Power BI model with a clinic switcher. A design write-up, since the code stays with the client."
tags: [Data Warehousing, SQL, Power BI]
draft: false
sources:
  - Profile/Portfolio/projects/nexlify-dw.html
  - CV/profile/MOHAMMED_ZAKARIA_PROFILE.md
  - Profile/Portfolio/index.html
  - Profile/Portfolio/scripts/generate-diagrams-v2.js
---

**Evidence: Production.** This was a client engagement I worked on as a Data Engineer at Nexlify, from January 2025 to January 2026, for a healthcare clinic network. The warehouse ran in production for that client. The code, schemas and data belong to the client, so I have no repository to link and I won't show patient data or real table definitions. What follows is the design and the reasoning behind it, kept to what I can stand behind.

## The problem

The client ran more than ten clinics, and each clinic kept its own data. Some of it lived in Excel sheets and CSV files. Some came from clinic management system APIs. The rest sat in a mix of database engines: MySQL, PostgreSQL, SQL Server and SQLite. Column names and structures differed from clinic to clinic, and much of the text was mixed Arabic and English, with numbers written in more than one format.

That setup had three effects:

- **No company-wide view.** Leadership could not answer simple cross-clinic questions without someone stitching spreadsheets together by hand.
- **Slow, fragile reporting.** Dashboards built on the legacy SQL timed out often, which blocked executive reporting.
- **Low trust in the numbers.** Inconsistent formats across sources meant the same metric could come out differently depending on where you pulled it from.

The subject areas were the usual ones for a clinic business: customers, staff, revenue, orders, sales, schedules and appointments.

For scale, the daily volumes across the network were modest: 50+ new customers, around 200 appointments and roughly 1,000 revenue and ledger records a day. The historical backlog was larger, in the millions of records, and that backlog was where most of the cleaning effort went.

## Architecture

The shape is a standard batch warehouse. Airflow pulls from every clinic source into a staging layer, SQL transforms and Python cleaning scripts standardise the data, and the result loads into a PostgreSQL warehouse modelled as star schemas. Power BI sits on top.

```text
 CLINIC SOURCES            ETL                         WAREHOUSE              BI
 ──────────────            ───                         ─────────              ──
 Clinic APIs  ─┐
 Excel / CSV  ─┤
 MySQL        ─┤      ┌──────────────┐  stage   ┌───────────────┐
 PostgreSQL   ─┼────► │ Airflow      │ ───────► │ SQL transforms│
 SQL Server   ─┤      │ ingest       │          │ (CTEs, joins) │
 SQLite       ─┘      └──────────────┘          └───────┬───────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │ Python cleanse   │
                                              │ AR/EN text,      │
                                              │ numeric formats, │
                                              │ quality checks   │
                                              └────────┬─────────┘
                                                       │ load
                                                       ▼
                                   ┌───────────────────────────────────┐
                                   │ PostgreSQL warehouse              │
                                   │  star schemas                     │
                                   │  facts + dimensions + bridges     │      serve
                                   │                                   │ ───────────► Power BI
                                   └───────────────────────────────────┘            (clinic switcher)
```

The pieces, briefly:

- **Ingestion.** Airflow handled scheduling and ingestion from Excel, CSV and the clinic system APIs, as well as the database sources.
- **Staging and mapping.** A staging layer with unified schema definitions and mapping rules translated each clinic's columns into one shared vocabulary. I wrote the source-to-warehouse mapping as an explicit artefact, not as logic buried in queries.
- **Cleaning.** Custom Python scripts normalised data types, handled the mixed Arabic and English text, enforced naming conventions, and ran data quality checks before anything was loaded.
- **Warehouse.** Dimensional modelling with star schemas: fact tables, dimension tables, and bridge tables where a relationship was many-to-many.
- **Serving.** Power BI reports built on one model, with a clinic switcher.

## Decision 1: one shared star schema, not one model per clinic

The easy path with ten-plus clinics is to build a reporting model per clinic and then try to roll them up. I went the other way: every clinic maps into the same facts and dimensions, and "clinic" is just a dimension.

The cost of this choice is paid up front. Every source has to be mapped onto the shared schema before it can be loaded, and with sources this varied that mapping was real work. It is also why the staging layer and the written mapping rules mattered so much. Without them, the shared model would have drifted the first time a clinic changed a spreadsheet layout.

What it bought was that a cross-clinic question became a normal query. Company-wide totals and single-clinic views came from the same tables, so they could not disagree with each other.

The schema also had to move. Requirements changed during the year, and the star/snowflake design was adapted as the work spread across Medical, IoT and Fintech domains. I also evaluated MySQL against PostgreSQL as the warehouse engine. The warehouse ended up on PostgreSQL.

!!! note "Why a star and not just a normalised copy"
    The sources were already normalised, in their own different ways. Copying them into one database would have centralised the mess, not removed it. A star schema forces the questions that matter for reporting: what is the grain of each fact, and which dimensions describe it.

## Decision 2: bridge tables for staff with more than one role

Staff were the hardest part of the model. One person could hold several roles, and could work across more than one clinic. A plain staff dimension with a single role column cannot represent that. You either pick one role and lose information, or you duplicate the staff row and start double counting.

I modelled it with bridge (junction) tables between staff, roles and clinics. The facts link to staff, and the bridge carries the many-to-many relationship to roles and clinics.

| Option | What goes wrong |
|---|---|
| One role column on the staff dimension | Staff with several roles get flattened to one; reports by role are wrong |
| One staff row per role | Headcount and any staff-level measure get double counted |
| Bridge table between staff, roles and clinics | Correct attribution, at the price of an extra join and more care in the BI layer |

The trade-off is real. Bridge tables add a join, and in a BI tool they need care, because a careless measure that crosses a bridge will still double count. The win is that attribution downstream is accurate: a report sliced by role or by clinic reflects what staff actually do, not an arbitrary single label.

## Decision 3: fix the queries before blaming the volume

The timeouts were the problem everyone felt. Legacy SQL was timing out as data grew, and it was blocking executive reports.

With daily volumes in the hundreds to low thousands of rows, I treated this as a query-shape problem first, not a hardware one. I refactored the legacy pipelines across PostgreSQL, SQL Server, MySQL and SQLite: breaking large queries into CTEs so each step was readable and testable, reworking the JOIN logic, and adding indexes where they were missing.

The trade-off here is that this work is unglamorous and spread over four SQL dialects, each with its own quirks. It does not show up as a new component on an architecture diagram. It is also the change that the reported results credit most directly.

!!! tip "CTEs are for people first"
    The main value of restructuring with CTEs was that I could reason about each step and check its row counts on its own. Faster plans followed from seeing where the joins were fanning out.

## Results

These are the outcomes reported for the engagement:

- **Reporting cycles about 40% faster** across the network.
- **Query latency down about 30%** after the SQL refactor.
- **Zero dashboard timeouts** afterwards. They were eliminated, not just reduced.
- **10+ clinic sources** feeding one warehouse.
- **Millions of historical records** cleaned and standardised before loading.
- **One Power BI model** serving every clinic and the company-wide view, through a clinic switcher.

!!! warning "How to read these numbers"
    These figures are the outcomes as I report them on my CV and portfolio. I don't have the before-and-after benchmark logs or query plans to publish, because they stayed with the client. Treat them as reported results, not as a reproducible benchmark.

The result I value most isn't a percentage. Before the warehouse, the client had no company-wide view at all. Afterwards, operators at a single clinic and leadership looking across the network were reading the same model.

## What I'd do next

Looking back, three things would make this stronger, and I have since applied some of them in later work:

1. **Automated tests on the model.** The quality checks ran in Python before load. I'd add declarative tests on the warehouse itself (uniqueness of keys, valid references through the bridge tables, row-count reconciliation from source to fact) so a broken mapping fails loudly in the pipeline, not quietly in a dashboard.
2. **Keep the benchmark evidence.** I'd record query timings and plans before and after each refactor as part of the work, so a claim like "30% lower latency" comes with its own receipts.
3. **Document the BI rules for the bridges.** The bridge tables are only safe if every measure respects them. I'd write down, next to the model, which measures may cross a bridge and how, so the next person building a report doesn't reintroduce double counting.

## Case study

The case page has the architecture diagram, the stack, and the challenge and solution breakdown: [Healthcare Clinic Data Warehouse case study](../projects/nexlify-dw.html). There is no public code for this one; it was client work.
