---
title: "PostgreSQL, MySQL, ClickHouse, Neo4j, InfluxDB: when each wins"
date: 2026-11-08
summary: "How I choose between relational, columnar, graph, time-series, search and embedded databases, based on where I have used each one, what state that work is in, and the mistakes each one taught me."
tags: [Databases, SQL, Data Architecture]
draft: false
---

"Which database should we use?" usually gets answered by whatever the team used last. I try to answer it by asking what the data looks like, who writes it, and who reads it. This guide goes through the databases I have worked with, where each one was really used, and what state that work is in. Evidence: drawn from my production work at Waffarha, a freelance client warehouse, the Nexlify engagement (reported outcomes only), and portfolio projects linked below, several of them on synthetic data.

## The short version

| Database | Where I used it | Status of that work | What it was good at |
|---|---|---|---|
| PostgreSQL | Nexlify clinic warehouse; freelance clinic warehouse | Client, production | Star schemas, constraints, upserts |
| MySQL | Waffarha recommender output on AWS RDS; first clinic loader | Production; client | Being the app's database |
| ClickHouse | Waffarha offers, coupons and orders (the production database) | Production, read-only consumer | Fast reads over wide fact tables |
| SQL Server, SQLite, MySQL | Nexlify source systems | Client; reported outcomes | Sources to map and refactor |
| DuckDB | Estates lakehouse, credit-risk marts | Portfolio, synthetic data | Local analytics over Parquet |
| SQLite | Graduation-project web app, brand-radar pilot, small warehouses | Graduation project; pilot; portfolio | Zero-ops single-user storage |
| InfluxDB | Flight radar (NTI capstone) | NTI capstone, live public data | Tagged time-series points for Grafana |
| TimescaleDB | AquaWatch | Prototype, simulated sensors | Time series with plain SQL |
| Neo4j | Ethereum forensics prototype | Prototype; no measured comparison | Multi-hop traversal (in design) |
| Elasticsearch | Petroleum platform, blockchain prototype | Compose service; in-memory stand-in | Search and Kibana dashboards (planned) |
| Redis | Waffarha assistant memory; fraud and price-tracker projects | Production config; portfolio | Small shared state, queues, counters |
| pgvector | Waffarha assistant config default | Benchmarked; cutover deferred | Vectors next to relational data |

## PostgreSQL: my default warehouse

When I need a warehouse that one team owns and writes to, I start with PostgreSQL. At Nexlify I evaluated MySQL against PostgreSQL for a warehouse that pulled from 10+ clinics, and the warehouse ended up on PostgreSQL, modelled as star schemas with bridge tables for staff who hold several roles ([One warehouse, ten clinics](../articles/one-warehouse-ten-clinics.html)).

For the freelance clinic client I used the parts of PostgreSQL that let the database defend itself. `fact_orders.source_row_id` is `UNIQUE`, so a daily full re-send updates rows instead of duplicating them. `dim_staff` has a `CHECK` constraint on six staff groups. Dimensions are scoped by `clinic_id` with `UNIQUE(clinic_id, name)`, so one floor's data can never be counted as another's. The ETL also reads `information_schema.columns` before loading, to catch schema drift ([the six-stage ETL](../articles/six-stage-client-etl.html)).

The lesson from that project: constraints only help if the pipeline knows about them. I now write a matching quality rule for every constraint in the DDL ([why](../articles/six-stage-client-etl.html)).

## MySQL: when it is the application's database

At Waffarha, MySQL on AWS RDS is what the app reads, so that is where the nightly recommender writes. The job reaches it through an SSH tunnel on EC2 and upserts in 5,000-row batches with `INSERT ... ON DUPLICATE KEY UPDATE`, keyed on the user, committing after each batch ([Fail open, never fail the night](../articles/fail-open-nightly-recommender.html)).

I don't choose MySQL for that job. The backend team did, and the right move for a pipeline is to write where the consumer already reads. The first version of the clinic loader was also MySQL: keyed upserts plus delete-and-reinsert of child rows inside one transaction. The PostgreSQL warehouse came later, with the six-stage checks around the load.

## ClickHouse: read it, don't own it

ClickHouse holds Waffarha's live offers, coupons and orders. My code reads it in two production paths: the recommender's active-offer filter, and the support assistant's lookups for a customer's own coupons and orders. Both treat it as someone else's database.

The assistant's client opens every session with `readonly=2`, a server-side `max_execution_time` and a `max_result_rows` cap, so the server itself refuses writes and runaway scans. Queries are fixed templates; the model never writes SQL ([Deterministic gates before the LLM](../articles/deterministic-gates-before-llm.html)).

ClickHouse has its own dialect, and it bit me twice. The Arabic text normaliser had to be built from nested single-pattern calls, because the function I wanted wasn't on our build. From `sql.py`:

```python
def _build_norm_template(inner: str = "%EXPR%") -> str:
    """``multiReplaceRegexpAll`` is not available on the target ClickHouse build, so the
    normaliser is a nest of single-pattern ``replaceRegexpAll`` calls."""
```

And list parameters must render as `['a','b']`, not as a tuple, because a one-element tuple degrades to a scalar. Small things, but they are why I test templates against the real server, not just a SQL parser.

The other ClickHouse lesson is about failure. If it is down at midnight, the recommender skips the active-offer filter and still writes fresh recommendations. That is right for the batch, but it means some picks can point at expired offers on those nights, and the run needs a status flag the app can check.

## SQL Server, SQLite and DuckDB

At Nexlify the source systems were a mix of MySQL, PostgreSQL, SQL Server and SQLite, plus Excel and clinic APIs. I refactored legacy SQL across those dialects with CTEs and reworked joins. The reported results were about 30% lower query latency and zero dashboard timeouts. Those are outcomes from my CV; the timing logs stayed with the client.

SQLite is what I reach for when there is one writer and no server to run. The graduation-project web app keeps logins and Q&A history in it ([Arabic RAG graduation project](../articles/arabic-rag-graduation-project.html)), and the brand-radar pilot runs locally on it ([Brand radar](../articles/brand-radar-connector-registry.html)). The mistake I made there: SQLite doesn't enforce `REFERENCES` unless `PRAGMA foreign_keys` is on, and in one estates warehouse build it wasn't ([Modeling estates data](../articles/estates-warehouse-governed.html)).

DuckDB is SQLite's analytical cousin. In the estates portfolio (synthetic data) it runs the lakehouse queries, dbt models and validation SQL over Parquet with no server ([8/8 sources, zero loss](../articles/estates-lakehouse-zero-loss.html)). If the work is analytics on one machine, DuckDB is faster to set up than any warehouse.

## Time series: InfluxDB and TimescaleDB

For the ADS-B flight radar ([Live flight radar](../articles/adsb-flight-radar-streaming.html)), my NTI capstone on live public data, Spark Structured Streaming writes one InfluxDB point per aircraft per 10-second micro-batch, tagged by `hex`, aircraft type and on-ground, and Grafana reads it with Flux. InfluxDB fits when the questions are "latest value per tag" and "aggregate per window".

The rule it taught me: tags should be things you group by, and the timestamp should come from the event (the radar's next iteration applies both; see its write-up).

For AquaWatch, a fish-farm prototype on simulated sensors ([AquaWatch](../articles/aquawatch-iot-alerts.html)), I used TimescaleDB instead, because the alerting and reporting wanted plain SQL joins next to the readings. My bug there: `create_hypertable` ran on every start without `if_not_exists`, which fails once the table is already a hypertable.

## Neo4j and Elasticsearch

Neo4j is the textbook answer for multi-hop questions like "where did this money go in three hops?" In the Ethereum forensics prototype ([Neo4j vs Spark](../articles/ethereum-neo4j-vs-spark.html)) the real client ingests in `UNWIND` batches of 100 and models each transaction as a node:

```cypher
(sender:Wallet)-[:SENT]->(t:Transaction {hash})-[:RECEIVED]->(receiver:Wallet)
```

with uniqueness constraints on `Wallet.address` and `Transaction.hash`. That project has no measured Neo4j-vs-Spark result: the timing harness runs against local stand-ins. Writing it also exposed a modelling mistake. The multi-hop query assumed direct wallet-to-wallet `SENT` edges, which this schema doesn't have, so the query and the schema have to be reconciled before any real comparison.

Elasticsearch appears in two of these repositories in limited form. The petroleum platform declares Elasticsearch and Kibana in Docker Compose, with the routing into them planned as NiFi UI work ([Petroleum platform](../articles/petroleum-nifi-beam-flink.html)). The blockchain prototype indexes into an in-memory stand-in and generates a Kibana dashboard config. My rule for it is simple: use it when the question is full-text search or log exploration, not as a system of record.

## Redis and pgvector

Redis holds small, shared, short-lived state. The Waffarha assistant's config uses it as the conversation-memory backend. In portfolio projects it holds daily counters for fraud scoring ([Fraud scoring](../articles/fraud-scoring-kafka.html)) and brokers Celery jobs for price tracking ([Watchdog](../articles/watchdog-price-intel.html)). I don't put anything in Redis I can't rebuild.

pgvector is tempting because vectors sit next to relational data. In my August 2026 benchmark it had lower recall@3 (0.847 vs 0.881 for the other four stores) and the slowest queries, at 65.06 ms ([Bilingual RAG](../articles/bilingual-rag-retrieval-hit-rate.html)). The assistant shipped on Qdrant. The current code defaults to pgvector, but the project's state log records that cutover as deferred, and it hasn't been re-measured. I'd measure it on our own eval before switching.

## How I choose

```text
Who writes the data?
 ├─ another team / the app      -> use their store, read-only, with limits (ClickHouse, MySQL)
 └─ my pipeline
     ├─ shape?
     │   ├─ rows with keys and constraints, BI on top   -> PostgreSQL
     │   ├─ analytics on one machine, files in, no ops  -> DuckDB
     │   ├─ metrics per tag over time                   -> InfluxDB / TimescaleDB
     │   ├─ paths between entities are the question     -> Neo4j (benchmark it first)
     │   └─ full-text search, log exploration           -> Elasticsearch
     └─ state that is small, shared and rebuildable     -> Redis
```

Two rules sit above the tree. Write where your consumer already reads, even if you'd have picked something else. And before claiming one database beats another for a workload, run both on the same data, warm, repeated, with the hardware written down. I learned the second rule from a benchmark harness that wasn't ready to make the claim yet.
