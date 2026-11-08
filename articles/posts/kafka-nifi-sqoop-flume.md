---
title: "Choosing an ingestion tool: Kafka, NiFi, Sqoop or Flume"
date: 2026-11-08
summary: "How I decide between Kafka, Flume, NiFi, Sqoop, RabbitMQ and Debezium for getting data in, based on an NTI Big Data internship and five portfolio pipelines, including the durability mistakes I found in my own configs."
tags: [Data Ingestion, Kafka, Streaming]
draft: false
sources:
  - Profile/Portfolio/articles/posts/adsb-flight-radar-streaming.md
  - Profile/Portfolio/articles/posts/fraud-scoring-kafka.md
  - Profile/Portfolio/articles/posts/retail-cdc-debezium.md
  - Profile/Portfolio/articles/posts/petroleum-nifi-beam-flink.md
  - Profile/Portfolio/articles/posts/telecom-lakehouse-8-domains.md
  - CV/profile/MOHAMMED_ZAKARIA_PROFILE.md
  - Workspace/Fraud_Detection/src/real_time/kafka_consumer.py
  - Workspace/Retail Analytics Pipeline/ingestion/debezium_config.json
  - Workspace/petroleum-platform/config/rabbitmq/definitions.json
---

Evidence: my Big Data Engineering internship at NTI (April to July 2026), where I practised Kafka, Flume and Sqoop ingestion, plus the portfolio projects and write-ups linked below. The busiest feed in those projects is a flight radar capped at 300 aircraft every 10 seconds, on one broker in Docker Compose. Treat this as a guide to choosing between the tools, built from wiring each of them up and then re-reading my own configs looking for the holes.

## The tools, and where I've used them

The first question I ask is not "which tool is best" but "what shape is the source". A database table, a log or HTTP feed, a stream of business events, and a pile of files each pull towards a different tool.

| Tool | What it's for | Where I've used it | Status |
|---|---|---|---|
| Kafka | Durable, replayable event log between producers and many consumers | [Flight radar](../articles/adsb-flight-radar-streaming.html), [fraud scoring](../articles/fraud-scoring-kafka.html), [retail streaming](../articles/retail-cdc-debezium.html); NTI internship | Portfolio; radar ran in Docker |
| Flume | Moving log or HTTP events into Kafka or HDFS through a source, channel and sink | Flight radar (two agents); NTI internship | Portfolio, ran in Docker |
| Sqoop | Bulk copy between relational databases and HDFS/Hive | NTI internship | See the Sqoop section below |
| NiFi | Visual flows with routing, provenance and back-pressure | [Petroleum platform](../articles/petroleum-nifi-beam-flink.html), two process groups created by a REST script | Scaffold, routing never built |
| RabbitMQ | Work queues with per-message routing, TTLs and length limits | Petroleum platform, 3 exchanges and 8 bounded queues | Scaffold, hops don't connect |
| Debezium | Change data capture from a database log into Kafka | Retail streaming, Postgres connector config | Configured, never registered |

## How I choose

```text
What is the source?
 |
 +-- a relational table, copied in bulk on a schedule
 |      -> Sqoop on a Hadoop estate; otherwise a scheduled extract (Airflow + SQL)
 |
 +-- a relational table, and consumers need every change in order
 |      -> Debezium into Kafka (needs logical replication on the database)
 |
 +-- logs or an HTTP feed that must land in HDFS
 |      -> Flume (file channel if the data matters)
 |
 +-- business events that several consumers read, or that you may replay
 |      -> Kafka, keyed on whatever must stay in order
 |
 +-- tasks for workers, routing by key, "process once then gone"
 |      -> RabbitMQ with publisher confirms
 |
 +-- many small sources, format conversion, and people who want to see the flow
        -> NiFi, with the flow exported to version control
```

The rule underneath: Kafka is a log you can re-read, RabbitMQ is a queue you drain, Flume and Sqoop are movers into Hadoop, and Debezium is how a database becomes a Kafka producer without touching its application code.

## Kafka: three settings I now check first

### The producer: acks and keys

In the retail project the POS producer favours durability:

```python
self.producer_config = {
    'acks': 'all',
    'retries': 3,
    'batch_size': 16384,
    'linger_ms': 10,
    'compression_type': 'gzip',
}
```

It keys by `transaction_id`, and every send waits on `future.get(timeout=10)`. The fraud project's producer also uses `acks='all'` with retries. The flight radar is the opposite: its Flume Kafka sink uses `acks=1` on a single broker with replication factor 1, three partitions. For a radar that refreshes every 10 seconds, losing a poll is harmless. For transactions it wouldn't be.

What I'd change: waiting on each send means `linger_ms` has nothing to batch, because the next record isn't sent until the previous one is acknowledged. At 2-5 simulated transactions a second it costs nothing. At real volume I'd use async sends with a delivery callback. And the key decides ordering: keying by transaction ID gives up per-store order, so if I needed ordered per-store aggregates, `store_id` would be the key.

### The consumer: what gets committed

This is the fraud consumer's setup and loop, trimmed:

```python
self.consumer = KafkaConsumer(
    config.KAFKA_TOPIC_TRANSACTIONS,
    group_id='fraud_detection_group',
    auto_offset_reset='latest',
    enable_auto_commit=True,
    auto_commit_interval_ms=1000,
    ...
)
# in the poll loop
except Exception as e:
    log.error(f"Error processing message: {e}")
...
self.consumer.commit()
```

Re-reading it, three things stand out. Auto-commit is on and the loop also commits by hand, so two mechanisms decide the offset. A message that throws is logged and then committed past, so a failure is dropped, not retried: that's at-most-once for the messages that matter most. And `latest` means a new consumer group skips everything already in the topic. Today I'd turn auto-commit off, commit only after a successful write, and send failures to a dead-letter topic.

### Topics nobody reads

The fraud project publishes alerts to `fraud_alerts`; nothing consumes it. The retail Debezium connector would write to `inventory` and friends; no job subscribes. Before I add a topic now, I write down its consumer.

## Flume: two agents, two channel choices

The flight radar is my Flume portfolio project. The Python poller POSTs to a Flume HTTP source instead of talking to Kafka, and a second agent drains Kafka into HDFS. The agents are deliberately different:

| Agent | Source | Channel | Sink |
|---|---|---|---|
| producer | HTTP, port 44444 | memory, capacity 10,000 | Kafka, `acks=1` |
| consumer | Kafka, batch 1,000 | file, capacity 100,000 | HDFS, roll every 120 s or 10,000 events |

The channel is the whole durability story in Flume. A memory channel loses what it holds if the agent dies; a file channel survives a restart. So only the archive side of my radar is durable. On the way in there are three places to lose data: the poller doesn't retry a failed POST, the memory channel, and `acks=1` on one unreplicated broker.

Would I use Flume again? On an existing Hadoop estate that needs files in HDFS, yes. For a new pipeline I'd let the producer write to Kafka directly with retries, and keep Flume, or Kafka Connect, only for the HDFS sink.

## NiFi and RabbitMQ: limits that only work with confirms

The petroleum platform puts RabbitMQ in front of everything so a fast replay can't overwhelm a consumer. The queue arguments show the idea:

```json
"name": "well.sensor.raw",
"arguments": {
  "x-message-ttl": 86400000,
  "x-max-length": 1000000,
  "x-overflow": "reject-publish"
}
```

`reject-publish` refuses new messages when the queue is full instead of silently dropping the oldest. But that only helps a producer that uses publisher confirms, and mine call `basic_publish` on a plain channel, so a refused message looks like a success. The definitions file is also mounted but never loaded, so the queues exist only if a client declares them. And when I mapped every queue to its publisher and consumer, nothing moved messages from the `raw` queues to the `validated` ones.

NiFi was meant to be that validation hop. A script calls the NiFi REST API to create two process groups (`ConsumeAMQP`, `ValidateJson`, `UpdateAttribute` on the sensor side) and then prints that routing should be configured in the UI. That routing was never built or exported, and the script hasn't been tested against a live NiFi 2.0. The lesson is about NiFi in general: a flow that lives only on the canvas disappears with `docker compose down -v`. If I use NiFi, the flow goes into version control as an exported definition from day one.

## Debezium and Sqoop: two ways to read a database

Sqoop is the batch answer: copy a table, or the rows changed since a last value, into HDFS or Hive on a schedule. I practised it during my NTI internship, where it was the database leg of the Hadoop ingestion stack.

Debezium is the streaming answer, and my retail config shows both what I understood and what I missed. It uses the built-in `pgoutput` plugin, an initial snapshot, a filtered publication, and a `RegexRouter` that shortens topic names to the table name. Then, from the published review of my own project:

- the connector JSON is mounted into the container, but nothing POSTs it to the Connect REST API, so it is never registered;
- Postgres doesn't set `wal_level=logical`, which `pgoutput` needs;
- the config uses `database.server.name` where Debezium 2.x expects `topic.prefix`;
- short topic names would collide if a second schema had a table with the same name.

!!! note "Configured versus running"
    The retail repo has a configured Debezium Postgres connector; it doesn't yet run CDC end to end. Those are different claims, and the second one needs a registered connector, logical replication on, and a consumer that MERGEs the changes into a table.

## What I'd do next

1. Re-run the flight radar with the producer writing straight to Kafka, `acks=all`, and a replication factor above 1, then count what reaches HDFS against what was polled.
2. Fix the fraud consumer's commit logic and add a dead-letter topic.
3. Make the retail CDC real: logical replication on, `topic.prefix`, a `curl` registration step, and a Spark job that merges `inventory` changes into a Delta table.
4. Add publisher confirms to the petroleum producers and export one NiFi flow.
