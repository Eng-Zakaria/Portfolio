---
title: "Wells meet markets: NiFi, RabbitMQ and Beam-on-Flink"
date: 2026-11-08
summary: "A portfolio scaffold that joins synthetic Volve-style well telemetry with EIA and Baker Hughes market feeds through RabbitMQ, NiFi and an Apache Beam job aimed at Flink. The design, what the code does, and what I would finish first."
tags: [Streaming, Apache Beam, NiFi]
draft: false
---

**Evidence: portfolio project, public data sources, synthetic data in the repo.** The well data is not the real Equinor Volve release. It is six CSVs that `scripts/generate-synthetic-volve.py` generates with `np.random.seed(42)`, using Volve column names and well IDs. The market side has two scrapers written against public sources: the EIA Open Data API (WTI and Brent spot prices, free key required) and the Baker Hughes rig-count pages. The repo has two commits, from 28 August and 2 September 2026. This is a scaffold: this post covers the design and the code, and the first end-to-end run is the next step.

## The problem

I wanted one place where a question like "did this well's pressure anomaly line up with a move in the oil price?" could be answered without joining CSV dumps by hand. Telemetry and markets are very different feeds. Sensor readings arrive every few seconds per well and are noisy. Spot prices are daily, and rig counts are weekly. The plan was to replay historical field data as if it were live SCADA telemetry, pull the market feeds on a schedule, push everything through one broker, and run streaming anomaly detection on the sensor side.

## Architecture

The Compose stack is the most complete part of the project. `docker-compose.yml` defines 16 services: RabbitMQ, three NiFi 2.0 nodes, an external ZooKeeper, Elasticsearch and Kibana, a Flink 1.18 JobManager with two TaskManagers, a BigQuery emulator, MinIO, Prometheus, Grafana, Postgres and Jenkins. `docker-compose.override.yml` adds four more: the replay simulator, the two scrapers and the Beam job, which makes 20.

The repo has six generated datasets. The profiling report (`data/profiling_reports/volve_profiling_latest.json`, run on 28 August) covers all six, 49.51 MB in total:

| File | Rows | What it is |
|---|---|---|
| `volve_sensor_data.csv` | 518,460 | 10-second readings, 6 sensor types per well |
| `volve_production_data.csv` | 39,456 | daily volumes per well, 2008–2016 |
| `volve_market_prices.csv` | 2,349 | random-walk WTI/Brent prices |
| `volve_rig_counts.csv` | 470 | weekly counts, labelled `Baker Hughes (synthetic)` |
| `volve_drilling_reports.csv` | 96 | templated text reports |
| `volve_well_info.csv` | 12 | well metadata |

`download-volve.sh` tries to fetch the real Volve files, but `data/downloads/` is empty.

Routing goes through RabbitMQ. `config/rabbitmq/definitions.json` declares three exchanges (`petroleum.sensors` and `petroleum.market` as topic exchanges, `petroleum.dlq` as direct) and eight queues. Each queue, its publisher and its consumer:

| Queue | Published by | Consumed by |
|---|---|---|
| `well.sensor.raw` | replay simulator | nothing |
| `well.sensor.validated` | Beam job (enriched readings) | NiFi `PetroleumSensorFlow` |
| `well.sensor.anomalies` | Beam job | nothing |
| `market.price.raw` | EIA scraper | nothing |
| `market.price.validated` | nothing | NiFi `PetroleumMarketFlow` |
| `market.rigcount.raw` | Baker Hughes scraper | nothing |
| `market.rigcount.validated` | nothing | NiFi `PetroleumMarketFlow` |
| `dead.letter` | nothing (bound on `dlq.*`; Beam publishes `dead.letter`) | nothing |

Each component is shaped correctly on its own. Connecting the hops is the next step: a `raw` → `validated` stage, a RabbitMQ source for the Beam job (more below), and a dead-letter binding that matches the publisher's key.

## Decision 1: a broker in front of everything, with hard limits

I put RabbitMQ between the producers and everything else, so that a replay running ten times faster than real time could not knock over a consumer. The queue arguments show the intent:

```json
"name": "well.sensor.raw",
"arguments": {
  "x-message-ttl": 86400000,
  "x-max-length": 1000000,
  "x-overflow": "reject-publish"
}
```

Sensor queues hold at most one million messages for 24 hours. Anomalies are kept for 7 days, and `dead.letter` for 30 days with a 10,000-message cap. `reject-publish` was a deliberate choice: when a queue is full, the producer gets refused. It does not lose the oldest messages without telling anyone.

The trade-off: `reject-publish` only protects you if producers use publisher confirms, so adding confirms to the producers (which call `basic_publish` today) is part of the next step, along with a `load_definitions` setting so RabbitMQ loads the definitions file at start. The queues are classic, not quorum.

## Decision 2: NiFi for validation and routing, configured from a script

NiFi gives visual flows, provenance and back-pressure, and I wanted a three-node cluster to learn how clustering behaves. All three nodes are configured in Compose against a separate `cp-zookeeper` container.

The flow artefact is `deploy-flows.py`, which calls the NiFi REST API to create two process groups. The sensor group gets `ConsumeAMQP`, `ValidateJson` and `UpdateAttribute`. The market group gets two `ConsumeAMQP` processors. The script ends with:

```python
print("Sensor ingestion flow deployed. Please configure routing in the NiFi UI.")
```

So the routing to Elasticsearch, the anomaly and DLQ branches, and the warehouse path described in `docs/nifi-flows.md` are planned as UI work, to be exported as a versioned flow. The trade-off I accepted was speed over reproducibility: a NiFi flow that lives only on a canvas is gone after `docker compose down -v`, which is why the export comes first.

## Decision 3: Beam with the Flink runner, not a native Flink job

I wrote the detector in the Beam Python SDK so the same code could run on the DirectRunner locally and on Flink in the stack. `anomaly_pipeline.py` keys readings by `(well_id, sensor_type)` and uses 5-minute sliding windows that advance every minute. A processing-time trigger fires every 10 seconds in accumulating mode. Each window needs at least 30 samples before it scores anything. A reading is flagged when it hits any of four rules: a global z-score above 3, Tukey's 1.5×IQR fences, a z-score above 2.5 against the last 10 points, or a fixed per-sensor limit such as wellhead pressure above 600. Scores above 0.7 are labelled `critical`.

On the Flink side, `flink-conf.yaml` sets 60-second exactly-once checkpoints on incremental RocksDB, and the job passes `--flink_parallelism 2`.

The trade-off was portability against a much thinner Flink integration, and the code shows the cost. When the runner is Flink, the source is:

```python
| 'ReadFromRabbitMQ' >> beam.io.ReadFromPubSub(
    topic='projects/petroleum/topics/sensor-data'
)
```

That is a Google Pub/Sub placeholder: the Beam Python SDK has no RabbitMQ source, so the Flink path needs a bridge (see next steps). On the DirectRunner, the source is 1,000 synthetic readings from `beam.Create`.

## Results

What exists:

- A 20-service Compose definition with resource limits, health checks and named volumes. One conflict remains: `nifi-2` and the Flink JobManager both bind host port 8081.
- A synthetic, reproducible Volve-shaped dataset (about 560,000 rows) and a profiling script that ran against it.
- A RabbitMQ topology with explicit TTLs, length caps and overflow behaviour.
- A Postgres schema (`init.sql`) with monthly partitions for sensor readings, plus tables for anomalies, prices, rig counts and production, ready for the first writer.
- Grafana dashboards that query metrics such as `petroleum_market_price` and `petroleum_well_correlation_coefficient`; exporting them with `prometheus_client` is next.

Scaffolding for later:

- Kubernetes: a namespace and one NiFi Deployment. The folders for the other services and all overlays are empty.
- Terraform: provider blocks and a namespace. The four module folders are empty, and the root and `dev` modules call each other.

Throughput, latency and anomaly-precision numbers come with the first end-to-end run.

## What I'd do next

1. **Close the loop with one path.** Replay sensor CSV → `well.sensor.raw` → Beam → `well.sensor.anomalies`: point the replay at the sensor file, fix the replay script's syntax error, and add publisher confirms.
2. **Give Beam a real source and a clean build.** Write a small RabbitMQ-to-Kafka bridge and use Beam's Kafka IO on the Flink runner (or write the detector as a PyFlink job), give the dead-letter steps unique labels, pin a supported Beam/Flink pair, and test `ComputeRollingStats` with known outliers plus a `TestStream` run for the windowing.
3. **Export the NiFi flow** as a versioned flow definition, so it can be reloaded instead of rebuilt by hand.
4. **Use real market data.** Save one real EIA response as a fixture before building any correlation, and leave the BigQuery emulator, MinIO, Jenkins and Terraform until there is data for them.

## Links

- Case study: [Petroleum Platform](../projects/petroleum-platform.html)
- Code: [github.com/Eng-Zakaria/petroleum-platform](https://github.com/Eng-Zakaria/petroleum-platform)
