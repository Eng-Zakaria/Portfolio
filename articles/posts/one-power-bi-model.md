---
title: "One BI model, many sites: how I design Power BI models for multi-site data"
date: 2026-11-08
summary: "How I build one Power BI model that serves every clinic or building instead of one model per site: the site as a dimension, one filter path, role-playing staff, RLS by site and a data-quality page. Plus where Grafana and Matplotlib fit, and the dashboard mistakes I keep finding in my own repos."
tags: [Power BI, Data Modeling, BI]
draft: false
sources:
  - Profile/Portfolio/articles/posts/one-warehouse-ten-clinics.md
  - Profile/Portfolio/articles/posts/six-stage-client-etl.md
  - Profile/Portfolio/articles/posts/estates-warehouse-governed.md
  - Profile/Portfolio/articles/posts/adsb-flight-radar-streaming.md
  - Profile/Portfolio/articles/posts/retail-cdc-debezium.md
  - Profile/Portfolio/articles/posts/aquawatch-iot-alerts.md
  - Profile/Portfolio/articles/posts/petroleum-nifi-beam-flink.md
  - CV/profile/MOHAMMED_ZAKARIA_PROFILE.md
  - free-lancing/pds/pg/DOCUMENTATION.md
  - free-lancing/pds/mysql-floor17/DOCUMENTATION.md
  - estates-data-portfolio/projects/p07-asset-maintenance/powerbi/model.md
  - estates-data-portfolio/projects/p07-asset-maintenance/powerbi/measures.dax
  - estates-data-portfolio/projects/p07-asset-maintenance/powerbi/build-guide.md
  - estates-data-portfolio/projects/p07-asset-maintenance/powerbi/queries/fct_work_order.pq
  - estates-data-portfolio/projects/p07-asset-maintenance/validation/v01_overview.sql
  - estates-data-portfolio/projects/p07-asset-maintenance/docs/ACCEPTANCE_P07.md
  - Workspace/digital-estates-platform/powerbi/measures.dax
  - Workspace/digital-estates-platform/analytics/netzero.py
---

Every multi-site reporting job I have had starts with the same temptation: build a report per site, then roll them up. I now do the opposite. One model, the site as a dimension, and every page filtered by it. **Evidence:** this comes from the clinic-network warehouse at Nexlify (production client work; I can only describe the design, the code stayed with the client), a freelance clinic warehouse (client work, the design notes are mine), and two estates portfolio projects on synthetic data, where the Power BI work is a documented handoff (model, Power Query, DAX, wireframes, tie-out SQL) and not a published report. The Grafana and Matplotlib parts come from portfolio projects linked below.

## When one shared model is the right call

At Nexlify the client had more than ten clinics, each with its own spreadsheets, APIs and database engine. The warehouse mapped all of them into one star schema where clinic is just a dimension. On top of it sat one Power BI model with a clinic switcher, serving each clinic's own view and the company-wide view. The reported outcomes were reporting cycles about 40% faster and zero dashboard timeouts after the SQL refactor. Those are reported results; I have no benchmark logs to publish. The full write-up is in [One warehouse, ten clinics](../articles/one-warehouse-ten-clinics.html).

The reason I go this way is simple. If the network total and a single clinic's number come from the same tables and the same measures, they cannot disagree. With a model per site, every rollup is a reconciliation problem waiting to happen.

The cost is paid in the warehouse, not in Power BI. Every source has to be mapped to the shared schema before it loads. In the freelance clinic warehouse I put `clinic_id` on every fact, bridge and dimension table from day one, so that a second floor could load into the same database later "by pointing a second ETL config at the same database — no schema changes required" (from my design notes). See [the six-stage ETL post](../articles/six-stage-client-etl.html) for the load side.

```text
            dim_clinic ──────────────► fact_orders ◄─────── dim_date
                                         │  │   (order_date active,
            dim_staff ── salesperson ────┘  │    conversation_date via
               │  └──── reception (inactive)│    USERELATIONSHIP)
               │                            ▼
               ├──── fact_order_performer   fact_order_upsell ──┐
               └────────────────────────────────────────────────┘
   No dim_staff → dim_clinic relationship: clinic filtering flows only
   through fact_orders[clinic_id]. Staff are scoped per clinic in the
   database with UNIQUE(clinic_id, staff_name), not in the model.
```

## Pattern 1: the site filter gets exactly one path

The rule I wrote into the clinic model notes is the one I would give anyone building a multi-site model: do not create a `dim_staff -> dim_clinic` relationship. `fact_orders[clinic_id] -> dim_clinic` already carries all the filtering, and a second path through staff creates an ambiguous loop.

It is tempting to add it, because staff really do belong to a clinic. But that fact is enforced in the database with `UNIQUE(clinic_id, staff_name)`. Power BI does not need to know it. One site filter, one path, and the switcher behaves the same on every page.

## Pattern 2: one staff dimension, many roles

In clinic data the same person can be the salesperson on one order, the upseller on another and the performer on a third. The model needs one staff table so per-person totals add up, but several relationships into it. Only one can be active, so the others are switched on per measure. From the freelance design:

```dax
Reception Handled Count :=
CALCULATE(
    COUNTROWS(fact_orders),
    USERELATIONSHIP(fact_orders[reception_id], dim_staff[staff_id])
)
```

The same design handles two date roles (conversation date and order date) against one `dim_date`. Where `RELATED` can't follow an inactive relationship, the patient-journey drillthrough page in the design uses `LOOKUPVALUE` in calculated columns to build a one-line story per order. That drillthrough page is a design in the documentation, and I describe it as one.

!!! note "The mistake that led to this pattern"
    An earlier iteration of the MySQL version gave upsells and visits their own staff views (`upsell_staff`, `visit_staff`) instead of inactive relationships. I abandoned it. Those views were disconnected from `staff`, so Power BI could not tell that the upseller and the performer were the same person, and combined per-person totals broke. If your model has a dimension copied per role, that is the first thing I would check.

Bridge tables need the same care. At Nexlify, staff with several roles across several clinics went into bridge tables. That gives correct attribution, but a careless measure that crosses a bridge still double counts. I now write down which measures may cross a bridge next to the model, not just in my head.

## Pattern 3: per-site access with row-level security

A clinic switcher is a slicer: everyone can see every site. When each site manager should only see their own site, I move the same idea into RLS. The estates asset-maintenance project (P07, synthetic data) specifies a role filter on the building dimension, driven by a mapping table:

```dax
-- Role building_manager, filter on dim_building
[building_id] IN
    CALCULATETABLE ( VALUES ( rlsusers[building_id] ),
                     rlsusers[principal] = USERPRINCIPALNAME() )
```

The handoff lists four "View as" test cases: a manager sees only their building and the totals tie to the validation SQL filtered to that building; the analyst role sees all 8 buildings; an unmapped user gets a blank report; and the asset-health mart is scoped through the building path, with no filter of its own. That last test is the one-path rule from Pattern 1 again.

!!! warning "Status"
    The P07 RLS design and test cases are written down and the gold tables they run on exist. The `.pbix` is meant to be saved outside the repo and the screenshots folder is empty, so I can't show a run of those tests in Power BI Desktop. A Streamlit app mirrors three of the five pages from the same gold tables.

Power Query stays thin in these handoffs. Each table is one query against a Parquet file, with the folder as a parameter:

```text
let
    Source = Parquet.Document(File.Contents(GoldFolder & "\fct_work_order.parquet"))
in
    Source
```

All shaping happens in dbt before Power BI sees it. That keeps the logic testable and leaves Power BI with relationships and measures.

## Pattern 4: put a data-quality page in the report

A multi-site model mixes sources of different quality, so I give the report a page that shows it. In the freelance design that is a reconciliation measure:

```dax
Total Amount Check (reconciliation) :=
VAR Computed = SUM(fact_orders[paid_amount]) + SUM(fact_order_upsell[amount])
VAR Stored = SUM(fact_orders[total_amount])
RETURN Computed - Stored
```

Any non-zero result points at a row where the typed total doesn't match paid plus upsells, which is usually a data-entry slip. In the digital-estates showcase, one of its 10 DAX measures, `COBie Completeness %`, divides the clean rows by clean plus quarantined rows. That puts the quarantine count in the report itself. The estates P07 handoff goes one step further. Every KPI card has an expected value in a build guide (for example PPM completion 93.0%, MTTR 3.17 days) that comes from a SQL file run against the same gold tables, so whoever builds the report can check each card against a number.

## Grafana, Matplotlib and the rest

| Tool | Where I used it | Status | When I pick it |
|---|---|---|---|
| Power BI (DAX, Power Query, RLS) | Nexlify clinic network; freelance clinic; estates handoffs | Client work; estates is spec plus SQL tie-outs | Business reporting over a star schema, many sites, per-user security |
| Grafana | Flight radar: provisioned dashboard, 6 panels, 10 s refresh over InfluxDB | Portfolio, ran against live data | Time series and live operational views |
| Streamlit | Estates projects mirror Power BI pages | Portfolio | When the reviewer has no Power BI licence |
| Matplotlib | Static PNG charts in estates scripts (e.g. net-zero intensity) | Portfolio | A chart that ships as a file in a pipeline output |

I have also built dashboards in Tableau, including during my NTI internship. The patterns in this article are tool-neutral, but the snippets here are all Power BI.

Grafana taught me the most about the gap between a file and a dashboard. The [flight radar](../articles/adsb-flight-radar-streaming.html) dashboard is provisioned and was tuned against live data. Elsewhere, the retail project has one dashboard JSON with 9 panels but no provisioning folder, so Grafana never loads it ([retail write-up](../articles/retail-cdc-debezium.html)). AquaWatch runs a Grafana container with no dashboards checked in. The petroleum scaffold has dashboards that query metrics no service exports. A dashboard JSON in a repo proves nothing until the datasource and provisioning are in the repo too.

## Mistakes I'd warn you about

- **A panel title that lies.** The flight radar's "Aircraft Count by Type" panel counts position reports in the last 2 minutes, about 12 per aircraft, not distinct aircraft. Check what a count actually counts before you name the visual.
- **Copying a dimension per role.** Covered above. It breaks per-person totals silently.
- **A second filter path to the site.** It feels like more correct modelling, and it gives you an ambiguous model.
- **Calling a spec a report.** The estates handoffs are complete as specs, and I label them that way. The clinic documentation also points to a measures file (`powerbi/dax_measures.md`) that isn't in the project folder. The example measures in the documentation itself are what I can stand behind.

## When I'd choose something else

If each site really is a separate business with no shared questions, separate models are simpler and I would not force a shared schema. If the users need second-level freshness, I reach for Grafana over a time-series store, not Power BI. And if the audience has no Power BI licence, a Streamlit page over the same gold tables answers the same questions. In every case the model underneath stays the same: facts, conformed dimensions, and the site as one more dimension.
