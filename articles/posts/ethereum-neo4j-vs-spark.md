---
title: "Neo4j vs Spark for multi-hop money flows: building the benchmark harness first"
date: 2026-11-08
summary: "An Ethereum forensics prototype with a Bronze/Silver/Gold pipeline, three money-laundering detectors and a Neo4j-vs-Spark timing harness. The harness runs today against local stand-ins, so this post covers the design and what a fair comparison still needs."
tags: [Graph Databases, Spark, Blockchain]
draft: false
---

*Evidence: Portfolio project. The benchmark run used synthetic transactions; the code can also pull recent public Ethereum mainnet blocks through Infura. Neo4j, Spark and Elasticsearch are local stand-ins in the default run.*

## The problem

Tracing money on Ethereum is a graph problem. A wallet sends to a wallet, which sends to two more, which peel off a little value at each step. The questions an investigator asks are relationship questions: where did these funds go within three hops, which wallets fan out to dozens of recipients in a day, which chains of transfers shrink in value as they move.

There are two common ways to answer them. A graph database such as Neo4j stores wallets and transfers as nodes and edges and walks them directly. A batch engine such as Spark keeps transactions in a table and answers multi-hop questions with repeated self-joins. The usual intuition is that the graph database wins on traversal and the batch engine wins on wide aggregations. I wanted a project that would test that intuition on Ethereum data rather than assume it.

This post describes what I built: the pipeline, the detectors, and the timing harness. It also covers what the harness measures today, because the interesting part of a benchmark is whether it is fair.

## Architecture

The entry point is `main.py`. It picks a data source, runs a three-layer ETL, loads a graph, runs three timed comparisons and writes a Kibana dashboard config.

```text
 SimpleBlockchainClient (1,000 synthetic txs, 100 wallets)
   or RealBlockchainClient (Infura JSON-RPC, last 3 mainnet blocks)
                 |
                 v
 ETLPipeline  (pandas-backed "SimpleDataFrame")
   Bronze  -> drop rows without hash/from, lowercase addresses
   Silver  -> dedupe on hash, wei->ETH, gas cost, tx_type
   Gold    -> per-wallet sent/received stats, risk_tier 0-4
                 |
        +--------+-----------------+
        v                          v
 MockNeo4jClient            PerformanceTester
 (Neo4jClient exists,       wallet_degree / multi_hop_3 /
  not wired in)             suspicious_detection
        |                          |
        v                          v
 Mock Elasticsearch  ->  kibana_dashboard.json (config only)
```

Separately, `src/detection/` holds three detectors and a scoring module that work on plain lists of transaction dicts:

| Module | Rule in code |
|---|---|
| `chain_hopping.detect` | sender reaches at least 10 unique recipients within 24 h of the latest timestamp |
| `smurfing.detect` | sender has at least 50 transactions and some below 1 ETH; "high" when over 80% are small |
| `peel_chains.detect` | 2- and 3-hop paths where each forwarded value is lower than the last; top 50 returned |
| `scoring.score_wallets` | additive points for ETH volume, transaction count, unique counterparties and detector hits |

These detectors are covered by unit tests but are not yet called from `main.py`.

## Decision 1: build against stand-ins first

I did not want local development to depend on a running JVM, a Spark cluster, a Neo4j server and an Elasticsearch node. So the project has local stand-ins for all of them:

- `SimpleSparkClient` and `SimpleDataFrame` wrap pandas behind a Spark-like API (`select`, `groupBy().count()`, `dropDuplicates`, `withColumn`, `collect`).
- `MockNeo4jClient` accepts Cypher text and returns canned rows by keyword.
- The Elasticsearch client keeps documents in a Python list; parquet writes only log.

```python
# src/core/mock_neo4j.py
if "degree" in query.lower():
    return [{"degree": 42}]
elif "suspicious" in query.lower():
    return [{"address": "0x123...", "total_tx": 150}]
elif "path" in query.lower():
    return [{"path": ["0x123...", "0x456...", "0x789..."]}]
```

**Trade-off.** The whole pipeline runs from `python main.py` with only pandas installed, and the 25 unit tests run in a few seconds. The cost is that anything timed in this mode is timing the stand-in. The Spark-like wrapper also hides real Spark costs such as job scheduling, shuffles and serialization, which are exactly what matters when comparing against a graph database.

## Decision 2: model the transaction as a node

The real `Neo4jClient.ingest_transactions` uses `UNWIND` batches of 100 and `MERGE`s three things per transaction:

```cypher
(sender:Wallet)-[:SENT]->(t:Transaction {hash})-[:RECEIVED]->(receiver:Wallet)
```

Uniqueness constraints sit on `Wallet.address` and `Transaction.hash`, with relationship indexes on `block_number` and `value`.

**Trade-off.** Making the transaction a node keeps per-transaction properties (gas used, timestamp) in one place and lets a transaction later link to contracts or token transfers. The cost is that every wallet-to-wallet hop becomes two relationships, so traversal queries have to be written as alternating `SENT`/`RECEIVED` steps. The multi-hop query in the harness currently uses `(:Wallet)-[:SENT*1..3]->(:Wallet)`, which assumes direct wallet-to-wallet `SENT` edges. Against this schema it would not return paths. One of the two has to change before the comparison is run on a real Neo4j instance. The other option is a direct `(:Wallet)-[:SENT {hash, value}]->(:Wallet)` model, which makes hop queries simpler but puts transaction data on the edge.

## Decision 3: detectors as plain Python over transaction lists

The first versions of the detectors were GraphFrames motif queries and PySpark aggregations. I rewrote them as plain functions over lists of dicts. For example, peel-chain detection builds an adjacency list and walks two and three hops looking for decreasing values:

```python
for edge2 in graph[receiver1]:
    if value2 >= value1 or value1 == 0:
        continue          # not peeling
    ...
    if receiver2 in graph:
        for edge3 in graph[receiver2]:
            if value3 < value2: ...  # 3-hop chain, risk "high"
```

**Trade-off.** The rules are easy to read and test, and they do not need Spark or Neo4j. They are also engine-neutral, so the same logic can be ported to Cypher or to Spark joins and the results compared row for row. The cost is scale: nested loops over an in-memory adjacency list are fine for a few thousand transactions, not for a day of mainnet. The chain-hopping rule also measures fan-out from one wallet in a time window. It does not look across chains, so the name promises more than the rule does.

## Results

What I can verify from the repository:

- **Tests:** 25 unit tests pass (12 for the detectors and scoring, 13 for the DataFrame wrapper).
- **Pipeline:** with no Infura key, `main.py` generates 1,000 synthetic transactions across 100 random wallets and runs them through Bronze, Silver and Gold. With a key, it fetches the last three mainnet blocks over JSON-RPC and falls back to 500 synthetic rows if that fails.
- **Dashboard:** the Kibana dashboard config is generated as JSON. Indexing goes to the in-memory Elasticsearch stand-in.

- **Benchmark harness:** the harness, the timing code and the report generator work end to end against the local stand-ins (three query types: multi-hop, suspicious-wallet detection, wallet degree).

!!! note "Next run"
    The real-engine comparison, a real Neo4j server against a real SparkSession on the same snapshot, is the next run.

## What I'd do next

1. **Wire in the real engines.** Pass `Neo4jClient` to the tester and run real PySpark (the version is already pinned at 3.5.0) instead of the pandas wrapper. Load the same snapshot into both.
2. **Fix the queries.** Make the multi-hop Cypher match the Wallet→Transaction→Wallet schema. Rewrite the suspicious-wallet query with `COUNT { (w)-[:SENT]->() }`, because Neo4j 5 no longer accepts pattern expressions inside `size()`. On the Spark side, implement a real 3-hop traversal as iterative self-joins or a GraphFrames BFS.
3. **Use real data at a real size.** Run `scripts/etl/bulk_fetcher.py` over a fixed block range so both engines see the same mainnet transactions, and record the transaction count, wallet count and edge count.
4. **Measure properly.** Warm up, repeat each query 10 or more times, report the median and p95, and log hardware, memory settings and engine versions next to the results. Count Spark session start-up separately from query time, and count Neo4j ingest separately from traversal.
5. **Connect the detectors.** Call `run_all_detections` from `main.py` and send the flagged wallets to the dashboard index. That is the path from "benchmark" to "forensics tool".

## Links

- Case study: [Blockchain Analyzer](../projects/blockchain-analyzer.html)
- Code: [github.com/Eng-Zakaria/blockchain-analyzer](https://github.com/Eng-Zakaria/blockchain-analyzer)
