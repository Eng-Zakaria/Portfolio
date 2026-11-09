---
title: "Live flight radar: Flume, Kafka, Spark Structured Streaming, InfluxDB"
date: 2026-11-08
summary: "How I wired live adsb.lol aircraft positions over Cairo through two Flume agents, Kafka, Spark Structured Streaming and InfluxDB into a Grafana map, and what the design gets right and wrong."
tags: [Streaming, Kafka, Spark]
draft: false
---

**Evidence label: Portfolio (live public data).** I built it as my capstone project for the NTI Big Data internship (2026); it isn't client work. It pulls real, live aircraft positions from the free [adsb.lol](https://api.adsb.lol/docs) ADS-B API, but the volume is small: one request every 10 seconds, capped at 300 aircraft per request, all running in Docker Compose on one machine. The repository has no saved logs, benchmarks or screenshots, so this article describes what the code does and what its configuration allows. It does not report measured throughput or latency.

## The problem

I wanted a project that touches every piece of a classic Hadoop-era streaming stack in one place: Flume for ingestion, Kafka as the buffer, Spark Structured Streaming for processing, HDFS for the raw archive, and a time-series store with a live dashboard on top. Most tutorials use fake click events. I wanted real data that changes every few seconds and is easy to check by eye, and aircraft positions fit well: if the dots on the map line up with Cairo International Airport, the pipeline works.

The data source is adsb.lol, a community-run ADS-B aggregator. It needs no API key and publishes data under the ODbL licence, so any dashboard built on it has to credit adsb.lol. By default the poller asks for every aircraft within 250 nautical miles of Cairo (`/v2/point/30.0444/31.2357/250`). It also supports three global endpoints through one environment variable: military aircraft (`/v2/mil`), the LADD privacy list (`/v2/ladd`) and PIA addresses (`/v2/pia`).

## Architecture

```text
adsb.lol API  /v2/point/{lat}/{lon}/250   (poll every 10 s, max 300 aircraft)
      |
      v
data-source (Python)  -- flatten "ac" array, drop rows with no lat/lon
      |  HTTP POST, Flume JSONHandler format
      v
Flume agent "producer"   HTTP source -> memory channel -> Kafka sink (acks=1)
      |
      v
Kafka topic "aircraft-states"   1 broker, 3 partitions, replication 1
      |
      +----------------------------------+
      v                                  v
Flume agent "consumer"            Spark Structured Streaming (local[2])
Kafka source -> file channel      query 1: every 10 s  -> aircraft_states_raw
-> HDFS sink                      query 2: every 30 s  -> aircraft_states_agg
      |                                  |
      v                                  v
HDFS /aircraft-states/            InfluxDB 2.7 bucket "aircraft-states"
  dt=YYYY-MM-DD/hr=HH/*.json             |
                                         v
                                  Grafana 10.4 (6 panels, 10 s refresh)
```

Everything runs from one `docker-compose.yml`: ZooKeeper, a single Kafka broker, an init container that creates the topic, a Hadoop namenode and datanode, InfluxDB, Grafana, two Flume containers, the Spark job and the Python poller. The README asks for 8 GB of RAM, mostly for Hadoop and Spark.

The poller does the only real transformation before Kafka. adsb.lol sends `alt_baro` as a number in flight and as the string `"ground"` on the runway, so the producer turns that into a boolean and a zero:

```python
alt_baro_raw = ac.get("alt_baro")
on_ground = (alt_baro_raw == "ground")
alt_baro = 0.0 if on_ground else _num(alt_baro_raw)
```

It also renames the short API fields (`r` to `registration`, `t` to `aircraft_type`, `gs` to `ground_speed`), trims the padded callsign, and stamps an `ingested_at` time in UTC.

The Spark job reads the topic twice, once per streaming query. The first query writes one InfluxDB point per aircraft per 10-second micro-batch, tagged by `hex`, `aircraft_type` and `on_ground`. The second groups by aircraft type over a 1-minute window that slides every 30 seconds and writes count, average and maximum ground speed, and average barometric altitude. Grafana reads both measurements with Flux. The map panel takes the last latitude, longitude and altitude per `hex` from the past 2 minutes, so it shows each aircraft's current position, not a track.

## Decision 1: two Flume agents around Kafka

The poller does not talk to Kafka. It POSTs to a Flume HTTP source, and a second Flume agent drains Kafka into HDFS. That is more moving parts than a Python Kafka producer plus a small consumer, so it needs a reason.

The README gives the reasons: the producer agent buffers between the HTTP poller and Kafka, and the consumer agent gives file-channel buffering from Kafka to HDFS. A side benefit is that the poller needs no Kafka client, only `requests`. The two agents are set up differently on purpose:

| Agent | Source | Channel | Sink | What the channel buys |
|---|---|---|---|---|
| producer | HTTP, port 44444 | memory, capacity 10,000 | Kafka, `acks=1` | Fast, but events in the channel are lost if the container dies |
| consumer | Kafka, batch 1,000 | file, capacity 100,000 | HDFS, roll every 120 s or 10,000 events | Survives a restart; Kafka offsets plus the file channel protect the archive path |

The trade-off is that only the archive side is durable. On the way in there are three places where data can drop: the poller logs a warning and moves on if the POST to Flume fails (no retry), the memory channel loses whatever it holds on a crash, and `acks=1` on a single broker with replication factor 1 means one broker failure loses data. For a radar that refreshes every 10 seconds, losing one poll is fine because the next one replaces it. For anything that needs a complete history, it is not, and I would not call this ingestion lossless.

## Decision 2: two queries in one Spark job, written with foreachBatch

InfluxDB has no built-in Spark sink, so both queries use `foreachBatch` and the official `influxdb-client`:

```python
raw_query = (
    parsed_df.writeStream
    .foreachBatch(write_raw_to_influx)
    .outputMode("append")
    .option("checkpointLocation", "/tmp/spark-checkpoint/raw")
    .trigger(processingTime="10 seconds")
    .start()
)
```

The 10-second trigger matches the 10-second poll, so each micro-batch roughly holds one poll's worth of aircraft. The aggregate query runs every 30 seconds in `update` mode with a 1-minute watermark.

This is simple and easy to read, but it has costs I can see in the code:

- Each batch is pulled to the driver with `collect()`, and a new InfluxDB client is opened and closed per batch. At 300 rows per poll that is fine. At real volume it would not be.
- The window and watermark use `event_time = current_timestamp()`, which is Spark's processing time, not the `ingested_at` field the poller writes, and not the aircraft's own `seen_pos`. The "1-minute window" is really "rows Spark happened to read in that minute".
- The InfluxDB timestamp is `datetime.utcnow()` at write time, so a delayed batch shows up as if it were fresh.
- Writes are synchronous and not idempotent. If a batch is retried after a failure, its points are written again.
- Aggregate points are tagged with `batch_id`, which creates a new series every 30 seconds. That works for a demo but grows InfluxDB series cardinality without limit.

The upside is that both queries share one parsed DataFrame and one schema, and the whole job is about 200 lines of Python.

## Decision 3: cap the feed instead of scaling the stack

A 250 nm circle around Cairo, or any of the global endpoints, can return hundreds of aircraft per call. Rather than size Kafka and Spark for that, I capped it in the poller:

```python
aircraft = [a for a in aircraft if a.get("lat") is not None and a.get("lon") is not None]
if len(aircraft) > MAX_AIRCRAFT:
    aircraft = aircraft[:MAX_AIRCRAFT]
```

Rows without a position are dropped first, since adsb.lol leaves out `lat`/`lon` when the last position report is stale, and they cannot be mapped. Then the list is cut at 300. That puts a hard ceiling on load: 300 events every 10 seconds, so at most about 30 events per second. Spark runs as `local[2]` with 2 shuffle partitions to match.

The trade-off is that the cut is not random or ranked. If the API returns more than 300 aircraft, the ones after position 300 never appear on the map. The README says to shrink the radius rather than rely on the cap, and that is the honest fix for a single-node demo.

## Results

What the repository shows:

- A full stack that starts with `docker compose up --build -d`: 11 services, with health checks on ZooKeeper, Kafka, the namenode and InfluxDB, and a startup order enforced through `depends_on`.
- A provisioned Grafana dashboard with six panels: live aircraft positions on a Geomap, aircraft count by type, total tracked over time, average ground speed by type, average barometric altitude by type, and on-ground versus airborne.
- Raw JSON landing in HDFS, partitioned by date and hour, as `states-*.json` files.
- Two exported copies of the dashboard JSON from a running Grafana, and a follow-up commit that fixed the map query to keep `aircraft_type` per point. This tells me the stack ran and was tuned against live data, but there are no logs or screenshots in the repo to quote numbers from.

What it does not show: any measured messages per second, end-to-end latency, or uptime. The configuration caps the input at about 30 events per second, which is far from "at scale". The one latency fact I can state is the cadence: a new poll every 10 seconds, a Spark write every 10 seconds, and a Grafana refresh every 10 seconds, so a position on the map is roughly 10 to 30 seconds old.

!!! note "Small bugs I found while writing this"
    The consumer Dockerfile passes `--conf /opt/opt/flume/conf` (a doubled path) to `flume-ng`. The config file itself is passed separately, so the agent still loads its settings. The consumer config header still says `topic = user-events`, and the compose comment on the poller says "Random User API", both left over from an earlier template. The "Aircraft Count by Type" panel counts position reports in the last 2 minutes, about 12 per aircraft, not distinct aircraft.

## What I'd do next

1. Use event time. Parse `ingested_at` (or `ingested_at - seen_pos`) into a timestamp in Spark and use it for the watermark, the windows and the InfluxDB point time.
2. Make the ingest path durable or drop Flume from it. Either switch the producer agent to a file channel with `acks=all`, or let the poller write to Kafka directly with retries and keep Flume only for the HDFS archive.
3. Write to InfluxDB from the executors with `foreachPartition` and batched writes, and remove the `batch_id` tag.
4. Build real tracks. Keep the last N positions per `hex` with `applyInPandasWithState` or a Flux query over a longer range, and draw them as lines on the map.
5. Measure it. Log rows per batch and Spark's `processedRowsPerSecond` and batch duration, then switch to a global endpoint with the cap raised to see where the single-node stack actually bends.
6. Move secrets out of `docker-compose.yml` into an `.env` file that is not committed.

## Links

- Code: [github.com/Eng-Zakaria/aircraft-tracking-pipeline](https://github.com/Eng-Zakaria/aircraft-tracking-pipeline)
- Case page: [Aircraft Tracking Pipeline](../projects/aircraft-tracking.html)
- Data: aircraft data courtesy of [adsb.lol](https://adsb.lol), licensed under ODbL v1.0.
