---
title: "Spark and Hadoop in practice: what NTI taught and where I used it"
date: 2026-11-08
summary: "How I use Spark, Hadoop, Hive and Flink, with examples from my NTI Big Data internship and a set of portfolio pipelines. The patterns I reuse, the lessons from my own code, and when I would pick a smaller tool."
tags: [Spark, Hadoop, Big Data]
draft: false
---

Evidence: my Big Data Engineering internship at NTI (April to July 2026), plus the portfolio projects and write-ups linked below. The portfolio Spark jobs quoted here run on one machine, over a few hundred to about a thousand rows per run, which keeps them easy to rerun and inspect.

## Where this skill comes from

The structured part came from the NTI internship at Smart Village. That covered Spark, Python and SQL ETL scheduled with Airflow on a Hadoop stack (HDFS, MapReduce, YARN), with HBase and Hive on top and Kafka, Flume and Sqoop for ingestion. I also took the Huawei HCIP Big Data certification (H13-723) through NTI in 2026. My NTI capstone, the [flight radar](../articles/adsb-flight-radar-streaming.html), is in this portfolio, and the other examples come from pipelines that apply the same ideas to real or synthetic feeds:

| Project | Engine | Status | Scale |
|---|---|---|---|
| [Reddit medallion](../articles/reddit-medallion-pyspark.html) | PySpark batch, `local[*]` | Portfolio, live public data | up to ~1,000 posts per run |
| [Flight radar](../articles/adsb-flight-radar-streaming.html) (NTI capstone) | Spark Structured Streaming `local[2]`, HDFS archive | NTI capstone, live public data, ran in Docker | capped at 300 aircraft per 10 s poll |
| [Retail streaming](../articles/retail-cdc-debezium.html) | Spark windowed aggregates + a PyFlink job | Portfolio, synthetic data | simulator at 2-5 transactions/s |
| [Telecom lakehouse](../articles/telecom-lakehouse-8-domains.html) | PySpark + Delta MERGE | Written; first run next | n/a |
| [Petroleum platform](../articles/petroleum-nifi-beam-flink.html) | Apache Beam aimed at the Flink runner | Scaffold | n/a |

Two notes on that table. I practised Hive and MapReduce during my NTI internship; none of these five projects uses them. And the [Ethereum benchmark harness](../articles/ethereum-neo4j-vs-spark.html) has a Spark side, but in the default run it is a pandas wrapper with a Spark-like API, not Spark.

## How I use Spark

### Pattern 1: fix the schema at the boundary

The first thing I do in any Spark job is stop Spark from guessing types. In the Reddit pipeline, bronze is written with a hand-written schema:

```python
POST_SCHEMA = StructType([
    StructField("id", StringType(), nullable=False),
    StructField("subreddit", StringType(), nullable=False),
    StructField("score", IntegerType(), nullable=True),
    # ... 13 more
])
df = spark.createDataFrame(all_records, schema=POST_SCHEMA)
```

Inference on Python dicts can change a column's type between runs when a field happens to be null in the sample. A fixed schema makes every bronze file the same shape. The retail stream does the same thing for Kafka JSON: it parses the value against an explicit schema before any aggregation.

The lesson I took from writing it up: putting the schema in bronze means bronze isn't raw. Fields I didn't list are gone for good. Next time I'd land the JSON as-is and apply the schema in silver.

### Pattern 2: built-in expressions before UDFs

The engagement score and tier in Reddit silver are plain `F.when` chains, not the Python UDF that sits unused in `src/udfs.py`. Built-ins stay inside the JVM, so Spark can optimise them and no Python worker starts. Where I did use a UDF (the keyword topic tagger), it was both slower in principle and wrong in practice: substring matching tagged "software" as `war`. Word-boundary `rlike` would fix both problems.

### Pattern 3: event time, a watermark, and append mode for anything stored

In the retail job, product metrics use event time with a 10-minute watermark and 5-minute windows, and go to a Delta path in `append` mode:

```python
parsed_df = parsed_df.withWatermark("transaction_timestamp", "10 minutes")
product_metrics = (
    parsed_df.withColumn("item", explode(col("items")))
    .groupBy(window(col("transaction_timestamp"), "5 minutes"),
             col("item.product_id"), col("store_id"))
    .agg(sum("item.quantity").alias("total_quantity_sold"), ...)
)
```

Append mode on a watermarked aggregation writes each window once, after the watermark passes it, so the stored table never needs a window rewritten. The price is latency: a window lands about ten minutes after it closes. I chose correctness of the stored table over freshness.

### Pattern 4: foreachBatch when there's no sink

The flight radar writes to InfluxDB, which has no Spark sink, so both streaming queries use `foreachBatch` with the official InfluxDB client; the code is in the [flight radar write-up](../articles/adsb-flight-radar-streaming.html). It's short and readable, but it hides costs, which brings me to the lessons.

## Lessons from my own code

- **Event time, sink writes and series cardinality.** The flight radar's next iteration moves its window onto event time, writes from the executors with `foreachPartition`, and drops a high-cardinality tag; the details are in the [flight radar write-up](../articles/adsb-flight-radar-streaming.html).
- **Names that overpromise.** Reddit's `rolling_avg_engagement_3h` uses `rowsBetween(-2, 0)`, which is the last three posts, not three hours. `rangeBetween` on a timestamp is what the name needed.
- **A broadcast join that proves nothing.** Broadcasting a 10-row lookup onto about 1,000 posts shows the `BroadcastHashJoin` plan in `explain()`. It says nothing about performance.
- **An entry point that can't start.** `src/pipeline.py` in the Reddit repo imports a module that doesn't exist, so the orchestrated run fails before it fetches anything. The per-stage scripts work. A smoke test on a saved fixture is the fix.
- **Code that never ran.** The telecom bronze layer has a proper idempotent Delta MERGE (`whenMatchedUpdateAll().whenNotMatchedInsertAll()`) keyed on `call_sid`, but PySpark isn't installed by default in that project and the pipeline has never executed. Its schema-evolution step also writes nulls over new columns. Its first run is the next step.

## Hadoop and Hive in the portfolio

In the portfolio, Hadoop shows up as HDFS in the flight radar. A Hadoop namenode and datanode run in Docker Compose, and a Flume agent drains Kafka into HDFS:

```text
Kafka "aircraft-states" -> Flume (Kafka source, file channel, HDFS sink)
                        -> HDFS /aircraft-states/dt=YYYY-MM-DD/hr=HH/states-*.json
                           roll every 120 s or 10,000 events
```

Partitioning by date and hour in the path is the same habit Hive teaches: lay files out so a query can skip what it doesn't need. The radar repo doesn't put a Hive table over that archive yet; that's on the list at the end.

## Flink: one job written, one job aimed at it

The retail project has a PyFlink job that reads `retail_transactions` from Kafka, keys by customer, and runs two `KeyedProcessFunction`s, with output to a Kafka topic and a JDBC sink into Postgres. The environment enables 60-second checkpoints and parallelism 4. The petroleum project took a different route: an Apache Beam pipeline meant to run on the Flink runner, with Flink configured for exactly-once checkpoints on incremental RocksDB.

Neither has run logs yet. These are the changes I'd make before the first long run:

- **State in a Python dict.** The retail fraud function keeps each customer's recent transactions in `self.transaction_history`, a plain dict on the operator. Flink doesn't checkpoint that, so the 60-second checkpoints protect nothing that matters. The right tool is Flink keyed state (`ListState` or `MapState`) plus a timer to expire old entries.
- **Time types.** The same function subtracts a `timedelta` from `ctx.timer_service().current_processing_time()`, which returns epoch milliseconds as an integer. Reading it now, I expect that line to raise on the first event.
- **Portability that cost the source.** The Beam job's Flink branch reads from Google Pub/Sub, which the stack doesn't have, because the Beam Python SDK has no RabbitMQ source and I never wrote one.

!!! note "What I'd say in an interview"
    I design and write Flink jobs around keyed state, checkpoints and watermarks. These two portfolio jobs don't have a long run behind them yet. The next step is a PyFlink job with real keyed state and a `TestStream`-style test, run against a local Kafka.

## When I'd pick something else

A lot of real data fits on one machine: at Nexlify the clinic feeds came to about 1,000 revenue and ledger records a day. For my estates portfolio platform I used [DuckDB, Parquet and dbt](../articles/estates-lakehouse-zero-loss.html) and never felt a need for Spark. My rule of thumb:

| Situation | What I'd reach for |
|---|---|
| Data fits in memory on one machine, batch | DuckDB or pandas, plus dbt for SQL models |
| Data or joins outgrow one machine, or the team already runs Databricks/EMR | Spark batch with Delta or Parquet |
| Micro-batch latency (seconds) is fine, team knows Spark | Spark Structured Streaming |
| Per-event stateful logic, timers, low latency | Flink with keyed state |
| Existing Hadoop estate with Hive tables | Spark SQL over the Hive metastore, not new MapReduce |

The table is opinion, not benchmark; benchmarking one job at real size is the first item below.

## What I'd do next

1. Run one Spark job at a size that hurts: point the radar at a global endpoint, raise the cap, and log `processedRowsPerSecond` and batch duration until the single node bends.
2. Rewrite the retail Flink function with keyed state and timers, and add a test.
3. Put a Hive external table over the radar's HDFS archive, so the radar archive can be queried from Hive.
