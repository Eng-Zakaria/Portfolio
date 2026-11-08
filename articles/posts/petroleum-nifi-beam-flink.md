---
title: "Wells meet markets: NiFi, RabbitMQ and Beam-on-Flink"
date: 2026-11-08
summary: "A portfolio scaffold that joins synthetic Volve-style well telemetry with EIA and Baker Hughes market feeds through RabbitMQ, NiFi and an Apache Beam job aimed at Flink. What the code does, where the wiring stops, and what I would finish first."
tags: [Streaming, Apache Beam, NiFi]
draft: false
sources:
  - petroleum-platform/README.md
  - petroleum-platform/docs/architecture.md
  - petroleum-platform/docs/nifi-flows.md
  - petroleum-platform/docker-compose.yml
  - petroleum-platform/docker-compose.override.yml
  - petroleum-platform/config/rabbitmq/definitions.json
  - petroleum-platform/config/nifi/deploy-flows.py
  - petroleum-platform/config/nifi/flows/sensor-ingestion.json
  - petroleum-platform/config/flink/flink-conf.yaml
  - petroleum-platform/config/prometheus/prometheus.yml
  - petroleum-platform/config/grafana/dashboards/json/business-metrics.json
  - petroleum-platform/config/postgres/init.sql
  - petroleum-platform/beam-pipeline/src/anomaly_pipeline.py
  - petroleum-platform/replay-simulator/src/replay_simulator.py
  - petroleum-platform/scrapers/eia/scraper.py
  - petroleum-platform/scrapers/baker_hughes/scraper.py
  - petroleum-platform/scripts/generate-synthetic-volve.py
  - petroleum-platform/scripts/download-volve.sh
  - petroleum-platform/data/profiling_reports/volve_profiling_latest.json
  - petroleum-platform/terraform/main.tf
  - petroleum-platform/terraform/environments/dev/main.tf
  - petroleum-platform/kubernetes/base/nifi/deployment.yaml
---

**Evidence: portfolio project, public data sources, synthetic data in the repo.** The well data is not the real Equinor Volve release. It is six CSVs that `scripts/generate-synthetic-volve.py` generates with `np.random.seed(42)`, using Volve column names and well IDs. The market side has two scrapers written against public sources: the EIA Open Data API (WTI and Brent spot prices, free key required) and the Baker Hughes rig-count pages. Nothing in the repo shows either scraper running. There are no saved responses, no logs and no tests. The repo has two commits, from 28 August and 2 September 2026. This is a write-up of a scaffold, not of a system that ran in production.

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

Routing goes through RabbitMQ. `config/rabbitmq/definitions.json` declares three exchanges (`petroleum.sensors` and `petroleum.market` as topic exchanges, `petroleum.dlq` as direct) and eight queues. When I mapped every routing key to its publisher and its consumer in code, this is what I found:

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

The table is the honest architecture diagram. Each component is shaped correctly on its own, but the hops do not connect. Nothing moves a message from `raw` to `validated`. The Beam job does not read from RabbitMQ at all, as I explain below. The dead-letter binding uses a different key from the one the publisher uses.

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

The trade-off: `reject-publish` only protects you if producers use publisher confirms, and none of mine do. They all call `basic_publish` on a plain channel, so a rejected publish looks like a success. The queues are also classic, not quorum. One more gap: the definitions file is mounted into the container, but no `load_definitions` setting tells RabbitMQ to load it. As committed, the queues only exist if a client declares them.

## Decision 2: NiFi for validation and routing, configured from a script

NiFi gives visual flows, provenance and back-pressure, and I wanted a three-node cluster to learn how clustering behaves. All three nodes are configured in Compose against ZooKeeper. The README says "embedded ZooKeeper", but the Compose file runs a separate `cp-zookeeper` container.

There are no exported NiFi flows in the repo. `config/nifi/flows/sensor-ingestion.json` is a prose README despite its extension, and the `templates/` folder it mentions does not exist. The real artefact is `deploy-flows.py`, which calls the NiFi REST API to create two process groups. The sensor group gets `ConsumeAMQP`, `ValidateJson` and `UpdateAttribute`. The market group gets two `ConsumeAMQP` processors. The script ends with:

```python
print("Sensor ingestion flow deployed. Please configure routing in the NiFi UI.")
```

So the routing to Elasticsearch, the anomaly and DLQ branches, and the warehouse path described in `docs/nifi-flows.md` were planned as manual UI work, and none of that work was exported. The trade-off I accepted was speed over reproducibility. A NiFi flow that lives only on a canvas is gone after `docker compose down -v`. I also never checked the script against a live 2.0 API. The create calls send no `revision` object, and two of the processor class paths do not match NiFi's standard bundles.

## Decision 3: Beam with the Flink runner, not a native Flink job

I wrote the detector in the Beam Python SDK so the same code could run on the DirectRunner locally and on Flink in the stack. `anomaly_pipeline.py` keys readings by `(well_id, sensor_type)` and uses 5-minute sliding windows that advance every minute. A processing-time trigger fires every 10 seconds in accumulating mode. Each window needs at least 30 samples before it scores anything. A reading is flagged when it hits any of four rules: a global z-score above 3, Tukey's 1.5×IQR fences, a z-score above 2.5 against the last 10 points, or a fixed per-sensor limit such as wellhead pressure above 600. Scores above 0.7 are labelled `critical`.

On the Flink side, `flink-conf.yaml` sets 60-second exactly-once checkpoints on incremental RocksDB, and the job passes `--flink_parallelism 2`.

The trade-off was portability against a much thinner Flink integration, and the code shows the cost. When the runner is Flink, the source is:

```python
| 'ReadFromRabbitMQ' >> beam.io.ReadFromPubSub(
    topic='projects/petroleum/topics/sensor-data'
)
```

Despite the label, that reads from Google Pub/Sub, and the stack has no Pub/Sub. The Python SDK has no RabbitMQ source, and I never wrote one. On the DirectRunner, the source is 1,000 synthetic readings from `beam.Create`. Reading the file again, I also doubt the pipeline would build at all:

- the dead-letter loop applies the label `'WriteDLQ'` twice, and Beam rejects duplicate labels;
- the step after scoring is `beam.FlatMap(lambda x: x)` over dicts, which emits dictionary keys rather than readings;
- `pika` is imported inside `setup()`, but `process()` uses it.

!!! warning "What did not happen"
    Nothing in the repo shows the Beam job running on Flink: no job ID, no logs, no checkpoint directory, no output in Elasticsearch. The tests folders under `beam-pipeline/` and `replay-simulator/` are empty. The replay simulator as committed contains a syntax error (an unclosed `logging.info(` call and `args.pass`). The Compose override also starts the EIA scraper without the `--api-key` flag that the script requires.

## Results

What exists and works as files:

- A 20-service Compose definition with resource limits, health checks and named volumes. One conflict remains: `nifi-2` and the Flink JobManager both bind host port 8081.
- A synthetic, reproducible Volve-shaped dataset (about 560,000 rows) and a profiling script that ran against it.
- A RabbitMQ topology with explicit TTLs, length caps and overflow behaviour.
- A Postgres schema (`init.sql`) with monthly partitions for sensor readings, plus tables for anomalies, prices, rig counts and production. No code writes to it.
- Grafana dashboards that query metrics such as `petroleum_market_price` and `petroleum_well_correlation_coefficient`. No service exports those metrics, because no code uses `prometheus_client`.

What is scaffolding only:

- Kubernetes: a namespace and one NiFi Deployment. The folders for the other services and all overlays are empty.
- Terraform: provider blocks and a namespace. The four module folders are empty, and the root and `dev` modules call each other.
- There is no PySpark, ML or correlation code, and nothing writes to BigQuery or MinIO.

There are no throughput, latency or anomaly-precision numbers, because nothing ran end to end.

## What I'd do next

1. **Close the loop with one path.** Replay sensor CSV → `well.sensor.raw` → Beam → `well.sensor.anomalies`. The replay currently publishes production rows, which have no `SENSOR_TYPE`, so the Beam parser would drop them. I would switch it to the sensor file, fix the syntax errors and add publisher confirms.
2. **Give Beam a real source.** I would either write a small RabbitMQ-to-Kafka bridge and use Beam's Kafka IO, which works on the Flink runner, or drop Beam and write the detector as a PyFlink job. Then I would pin the Beam and Flink versions to a pair the runner supports.
3. **Export the NiFi flow.** I would build it once in the UI and commit it as a versioned flow definition, so it can be reloaded instead of rebuilt by hand.
4. **Test the detector on its own.** I would add unit tests for `ComputeRollingStats` with known outliers, then a DirectRunner test with `TestStream` for the windowing.
5. **Use real data for the market side.** Correlating production with a random-walk price series means nothing. I would save one real EIA response as a fixture before building any correlation.
6. **Trim the stack.** BigQuery emulator, MinIO, Jenkins and Terraform can wait until there is data to put in them.

## Links

- Case study: [Petroleum Platform](../projects/petroleum-platform.html)
- Code: [github.com/Eng-Zakaria/petroleum-platform](https://github.com/Eng-Zakaria/petroleum-platform)
