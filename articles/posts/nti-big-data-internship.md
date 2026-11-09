---
title: "The NTI Big Data internship and HCIP certification: what I would tell the next intern"
date: 2026-11-09
summary: "A reflection on my four months as a Big Data Engineering Intern at NTI and the Huawei HCIP Big Data certification: what the breadth of the stack is good for, how my capstone, a live flight radar, pulled it together, and where you have to go deeper yourself."
tags: [Career, Big Data, Certification]
draft: false
---

This is a career reflection, not a brochure. The facts come from my CV and the project write-ups linked below; everything else is my own opinion about how to get the most out of a programme like this. From April to July 2026 I was a Big Data Engineering Intern at the National Telecommunication Institute (NTI) in Smart Village, and in 2026 I took the Huawei HCIP Big Data certification (H13-723) through NTI. My capstone project was a live flight radar built on aircraft (ADS-B) data. If you are thinking about applying, this is what I would want someone to tell me.

## What the internship covered

My CV describes the internship in a few lines, and they are accurate about its shape: it was wide.

- ETL workflows in Spark, Python and SQL, with Airflow orchestrating multi-step pipelines end to end.
- The Hadoop core: HDFS, MapReduce and YARN, with HBase for NoSQL, Hive for warehousing and InfluxDB for time series.
- Ingestion with Kafka, Flume and Sqoop, moving data between relational sources and the Hadoop ecosystem, plus stream processing with Flink.
- AWS (EC2, S3, IAM, VPC), plus dashboards and reports in Power BI, Tableau and Grafana.

The certification sits on top of that. My site lists the HCIP Big Data topics as Hadoop, Spark, Hive, HBase, Kafka and Flink.

| When | What | Where it shows up now |
|---|---|---|
| 04/2026 | Start Big Data Engineering internship, NTI, Smart Village | CV, Internships & Training |
| 2026 | Capstone: live ADS-B flight radar | [Live flight radar](../articles/adsb-flight-radar-streaming.html) |
| 2026 | Huawei HCIP Big Data (H13-723), through NTI | Credentials |
| 2026 | AWS Certified Cloud Practitioner | Credentials |
| 07/2026 | Internship ends; I start as a Data Engineer at Waffarha | Experience |

## The capstone: a live flight radar

The project that pulled the programme together was my capstone, the [live flight radar](../articles/adsb-flight-radar-streaming.html). It takes real aircraft positions over Cairo from the free adsb.lol ADS-B API and runs them through most of the stack from the list above:

```text
adsb.lol API (poll every 10 s)
  -> Python poller -> Flume agent -> Kafka topic
        |-> Flume agent -> HDFS archive (partitioned by day and hour)
        |-> Spark Structured Streaming -> InfluxDB -> Grafana map
```

I picked aircraft data because it is live and easy to check by eye: if the dots on the map line up with Cairo International Airport, the pipeline works. That turned out to be a good rule for any capstone. Choose data where you can see at a glance whether the output is right, so you spend your time on the pipeline and not on wondering whether it is working.

The capstone also taught me something the labs didn't: durability is a decision you make per hop. For a radar that refreshes every 10 seconds, losing one poll is fine; for anything that needs a complete history, it is not. The ingest side's next iteration moves to `acks=all`, a replication factor above 1 and a durable channel, and counts what reaches HDFS against what was polled ([details](../articles/adsb-flight-radar-streaming.html)).

## Where I went deep: Spark

Of everything on the list, I went deepest on Spark. It shows up in the capstone as two Structured Streaming queries reading the same Kafka topic, one writing a point per aircraft every 10 seconds and one computing sliding-window aggregates by aircraft type. After the internship I kept using it, and I collected the patterns I reuse across five portfolio pipelines, plus the lessons from my own code, in [Spark and Hadoop in practice](../articles/spark-hadoop-in-practice.html).

Spark was a good choice for depth because it connects to almost everything else in the programme. It reads from Kafka and HDFS, writes to Hive and time-series stores, and runs batch and streaming with the same API. Once you know it well, the rest of the stack makes more sense, because you understand what each other tool is feeding or serving.

## What a programme like this is good for

**A map of the whole territory.** The biggest thing I took away was knowing what each layer of a classic big data stack is for and how the layers hand data to each other: an ingestion tool lands data, a distributed file system stores it, a resource manager schedules compute on it, an engine transforms it, a warehouse or NoSQL store serves it, and a dashboard shows it. Once you have that map, a new tool is a new answer to a question you already know how to ask: which layer is this, and what does it replace?

**Vocabulary that interviews assume.** Job posts for big data roles still list HDFS, YARN, Hive, HBase, Kafka and Sqoop by name. Having worked through them in one programme means I can explain why Sqoop is the batch way to read a database and CDC the streaming way, or why HBase and Hive answer different questions over the same cluster. I wrote that comparison out in [Choosing an ingestion tool: Kafka, NiFi, Sqoop or Flume](../articles/kafka-nifi-sqoop-flume.html).

**A certification that makes you cover the whole syllabus.** For the exam I studied, practised and researched. Studying for a vendor exam is different from building a pipeline: it makes you cover the parts of a topic you would skip in a project, like configuration, architecture components and how a product family fits together. For context, HCIP is the professional tier in Huawei's certification structure, above the associate level. I treat it as a structured syllabus I can show I finished, next to projects that show I can build.

**A bridge into a first data role.** The internship ended in July 2026, the same month I started as a Data Engineer at Waffarha. The production work there is different (an Airflow price-integrity pipeline, ClickHouse and MySQL integration, retrieval and recommendation pipelines), but the habits carry over: think in layers, schedule everything, and know where each piece of data lands.

## What I would tell someone starting the programme

None of this is a complaint about NTI; it is what I think is true of any short, broad programme. Four months across this many tools means you touch everything, so plan where you will go deeper.

```text
Before   ->  Get comfortable with Linux, SQL and Python. Everything else sits on these.
During   ->  Keep a one-page map: each tool, its layer, what it replaces, one gotcha.
         ->  Pick one "depth" tool (Spark was mine) and go past the labs.
         ->  Choose a capstone on live, checkable data that uses most of the stack.
         ->  Book the certification while the material is fresh.
After    ->  Put the capstone in a public repo and write it up, including what is broken.
```

1. **Treat the certificate as a floor, not a ceiling.** On my CV, the HCIP line sits next to links to projects. The projects are what make the line believable.
2. **Write down every tool's "why".** For each tool, one sentence on when you would *not* use it. That sentence is what interviews probe.
3. **Don't spend equal time on everything.** MapReduce is mostly useful as background: it explains why Spark looks the way it does. Spark, Kafka and Airflow you will use every year.
4. **Connect it to something current.** Most teams now also use lakehouse formats, managed cloud services and dbt. Writing [PostgreSQL, MySQL, ClickHouse, Neo4j, InfluxDB: when each wins](../articles/choosing-the-right-database.html) helped me link the two.
5. **Use the BI part.** Building dashboards in Power BI, Tableau and Grafana taught me what the consumer of a pipeline actually needs, which changes how you model the tables underneath.

## Would I do it again?

Yes, with a clear idea of what it is. A programme like NTI's gives you a guided tour of a full big data stack, a certification that shows you finished a serious syllabus, and, if you choose it well, a capstone that ties the tools together in one working system. The depth comes from what you push further yourself. For me that was Spark and the flight radar, and both are still part of how I work.
