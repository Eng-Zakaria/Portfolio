---
title: "Retail streaming on Kafka and Spark: what is wired, and where CDC comes next"
date: 2026-11-08
summary: "A code-level walkthrough of my retail streaming project: a simulated POS feed through Kafka into Spark and Delta, a configured Debezium connector that is the next piece to wire in, and a forecasting module trained on synthetic data."
tags: [Streaming, CDC, Delta Lake]
draft: false
---

**Evidence label: Portfolio project, synthetic data.** This post walks through the code and config and what each part is built to do; runtime numbers come with the first recorded run.

## The problem

A retailer's data shows up in different shapes and at different speeds. Tills produce transactions. The website produces clickstream events. The inventory database changes whenever stock moves. If you pull all of that in a nightly batch, sales and stock figures are already a day old when anyone reads them.

I wanted one streaming path. Changes get captured where they happen, land on Kafka, are aggregated by a stream engine, are written to a lake table, and end up as a demand forecast behind an API. This project builds that path locally in Docker Compose. The simulator → Kafka → Spark path is implemented; CDC and the forecast are the next pieces to connect.

## Architecture

The Compose file defines 15 services: zookeeper, kafka, postgres, redis, spark-master, spark-worker, flink-jobmanager, flink-taskmanager, api, prometheus, grafana, debezium, nginx, minio and jupyter. Here is how data actually moves through the code:

```text
POSSimulator (synthetic: 3 stores, 5 products, 8% tax)
      │  POSProducer: key=transaction_id, acks=all, gzip
      ▼
Kafka topic: retail_transactions ───────────────┐
      │                                         │
      ▼                                         ▼
Spark Structured Streaming               Flink job (PyFlink)
  watermark 10 min, window 5 min           keyed fraud / journey functions
  ├─ store x payment metrics ─▶ console    └─ JDBC sink ─▶ Postgres
  └─ product metrics ─▶ Delta (append)
       /data/processed/transactions/product_metrics

Postgres raw.* ──▶ Debezium connector JSON (pgoutput)
                     topics: transactions, transaction_items, inventory, ...
                     (registration and a consumer are next)

ml/demand_forecasting.py   trains only on a generated sine + trend series
serving/routes/ml.py       /api/v1/ml/demand-forecast returns MockDemandForecaster output
```

The live path is the top half: simulator to Kafka to Spark to Delta. The CDC branch and the forecast at the bottom are the parts I still have to connect.

## Decision 1: Key POS events by transaction and wait for all acks

The producer favors durability over throughput:

```python
self.producer_config = {
    'acks': 'all',
    'retries': 3,
    'batch_size': 16384,
    'linger_ms': 10,
    'compression_type': 'gzip',
}
```

Every send then calls `future.get(timeout=10)`, so each transaction blocks until the broker confirms it. The message key is `transaction_id`, which means retries of the same sale go to the same partition.

**Trade-off.** Waiting on every send means real batching never happens. `linger_ms=10` has almost nothing to group, because the next record isn't sent until the previous one is acknowledged. At the simulator's default rate (2 transactions per second in `main()`, 5 in `simulate_streaming`) that costs nothing. At real till volumes I would use async sends with a delivery callback. Keying by transaction ID also gives up per-store ordering. If I needed ordered per-store aggregates, `store_id` would be the better key.

## Decision 2: Event-time windows with a watermark, Delta only for append-safe output

Spark parses the JSON against an explicit schema. It turns `transaction_date` into an event timestamp, sets a 10-minute watermark and aggregates over 5-minute windows:

```python
parsed_df = parsed_df.withWatermark("transaction_timestamp", "10 minutes")
product_metrics = (
    parsed_df.withColumn("item", explode(col("items")))
    .groupBy(window(col("transaction_timestamp"), "5 minutes"),
             col("item.product_id"), col("store_id"))
    .agg(sum("item.quantity").alias("total_quantity_sold"), ...)
)
```

The job produces two outputs. Store-by-payment-method metrics go to the console in `update` mode. Product metrics go to Delta in `append` mode, with their own checkpoint directory. Append mode on a watermarked aggregation writes each window only once, after the watermark passes it. That means the Delta table never has to rewrite a window.

**Trade-off.** Append mode adds latency. A window is written at the earliest about 10 minutes after it closes, so this table is "near real time", not live. The faster `update` stream goes only to the console, which nothing downstream reads. Any event later than 10 minutes is dropped without a trace. I chose correctness of the stored table over freshness. Next, the update stream goes somewhere useful, like a Delta `MERGE` via `foreachBatch`, instead of stdout.

!!! note "What the Delta write still needs"
    The Spark session in `spark_streaming.py` doesn't set `spark.sql.extensions` or the Delta catalog, and doesn't add the Delta package. `delta-spark==2.4.0` is in `requirements.txt`, which matches Spark 3.4, but the `bitnami/spark:3.4` containers don't install it. The output path is a local `/data/processed/...` directory. There's no `s3a` config for the MinIO service, so Delta-on-MinIO is not wired up yet.

## Decision 3: Debezium with pgoutput and topic names shortened to the table

For the inventory and order tables, I wrote a Debezium Postgres connector config instead of polling:

```json
"connector.class": "io.debezium.connector.postgresql.PostgresConnector",
"plugin.name": "pgoutput",
"table.include.list": "raw.transactions,raw.transaction_items,raw.inventory,raw.customers,raw.products",
"transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
"transforms.route.regex": "([^.]+)\\.([^.]+)\\.([^.]+)",
"transforms.route.replacement": "$3",
"snapshot.mode": "initial",
"slot.name": "debezium_slot",
"publication.autocreate.mode": "filtered"
```

`pgoutput` is the logical decoding plugin built into Postgres, so I don't need an extra extension in the database image. `snapshot.mode: initial` copies the existing rows before streaming changes. The RegexRouter drops the `server.schema.` prefix, so changes to `raw.inventory` land on a topic named `inventory`. `column.include.list` keeps only the columns downstream jobs need, such as quantity, price and `quantity_on_hand`. Value converters have schemas disabled, so messages are plain JSON.

**Trade-off.** Short topic names are easy to read, but they throw away the schema. If a `staging.inventory` table ever gets captured, it collides with `raw.inventory`. Disabling converter schemas makes messages smaller, but consumers then need their own schema, which is exactly what the Spark job already does for the POS feed.

**Where it stands.** The connector config is mounted into the `debezium` container; wiring it in takes four steps: POST it to the Connect REST API on port 8083, start Postgres with `wal_level=logical` (which `pgoutput` requires), rename `database.server.name` to `topic.prefix` for Debezium 2.x, and add a Spark job that subscribes to the CDC topics. Today both engines read `retail_transactions` from the simulator.

## Results

Status by area:

| Area | What exists | Status |
|---|---|---|
| Stack | 15 services in `docker-compose.yml` | Defined |
| POS ingest | Simulator + Kafka producer, `retail_transactions` | Implemented, synthetic |
| Stream processing | Spark windowed aggregates; PyFlink keyed functions with JDBC sink | Implemented |
| Delta Lake | `format("delta")` append writes for product metrics and customer journeys | Coded; Delta not configured in the session |
| CDC | Debezium Postgres connector JSON | Configured; registration next |
| Batch | Reads `/data/lake/transactions` as Delta, falls back to Postgres JDBC | Coded; aligning its path with the stream job is next |
| Forecasting | ARIMA, linear / RF / GBM, optional LSTM, mean ensemble | Trained only in `main()` on generated data |
| Forecast API | `POST /api/v1/ml/demand-forecast` | Returns mock output |
| Monitoring | Prometheus scrape config, one Grafana dashboard JSON with 9 panels | Dashboard file only; provisioning folder missing |

There are no forecast accuracy numbers to report. `demand_forecasting.py` computes MAE and RMSE on an 80/20 time split for the ML models, and in-sample for ARIMA. The training data so far is a 2022–2023 daily series built from a linear trend, a sine wave and Gaussian noise, and the feature builder adds placeholder `price`, `promotion`, `competitor_price` and `weather_index` columns. The API endpoint uses a `MockDemandForecaster` until a trained model is loaded.

## What I'd do next

1. **Make CDC real.** Start Postgres with `-c wal_level=logical`, switch to `topic.prefix`, register the connector with a `curl` step in `quick-start.sh`, and add a Spark job that reads the `inventory` topic and `MERGE`s it into a Delta stock table.
2. **Configure Delta on MinIO properly.** Add the Delta package and extensions to the Spark session, set the `s3a` endpoint and credentials from `.env`, and make the batch job read the same path the stream job writes.
3. **Feed the forecaster from the lake.** Build a daily demand series from the `product_metrics` table, remove the placeholder features, evaluate on a held-out period, save the metrics, and serve the saved model (the `save_model` and `load_model` methods already exist).
4. **Add an end-to-end smoke test** (simulator to Kafka to a Delta row) to keep the path green.

## Links

- Case study: [Retail Analytics — Streaming Pipeline](../projects/retail-analytics-pipeline.html)
- Source: local project; no public GitHub repository yet.
