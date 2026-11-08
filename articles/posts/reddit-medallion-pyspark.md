---
title: "A 7-stage PySpark medallion for Reddit signals"
date: 2026-11-08
summary: "How I split a small Reddit batch job into bronze, silver and gold Parquet layers in PySpark, what each of the seven stages really does, and the shortcuts I would fix next."
tags: [Spark, Data Pipelines, Python]
draft: false
sources:
  - github.com/Eng-Zakaria/reddit-spark-pipeline/README.md
  - github.com/Eng-Zakaria/reddit-spark-pipeline/src/pipeline.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/src/schema.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/src/udfs.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/notebooks/01_ingestion.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/notebooks/02_transform.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/notebooks/04_windows.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/notebooks/05_enrichment.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/notebooks/06_optimization.py
  - github.com/Eng-Zakaria/reddit-spark-pipeline/notebooks/07_output.py
---

**Evidence label: Portfolio (live public Reddit data).** This is a personal project, not client work. It pulls real posts from Reddit's public JSON endpoints, but the volume is small: at most 100 posts from each of 10 subreddits per run, so about 1,000 rows, processed by Spark in `local[*]` mode on one machine. The repository has no saved outputs, logs or benchmark files, so this article describes what the code does, not measured results.

## The problem

I wanted a practice ground for the Spark patterns I use at work: explicit schemas, quality filters, window functions, broadcast joins and partitioned Parquet. I also wanted the data to be real and a little messy. Reddit's public listing endpoint is a good fit. It needs no authentication, it returns nested JSON, and it has the usual problems: deleted authors, bot posts, missing fields.

The question the pipeline answers is simple: across a fixed set of subreddits, which posts from the last day got the most engagement, and how does engagement split by community, hour and topic?

## Architecture

The code comes in two forms. `notebooks/01_ingestion.py` to `07_output.py` are standalone scripts, one per stage, each with its own SparkSession and extra diagnostic output. `src/pipeline.py` collects the same seven stages into functions that `main()` runs one after another in a single session.

```text
 Reddit /r/{sub}/top.json?t=day&limit=100   (10 subreddits, 1 s sleep between calls)
                     |
 [1] Ingestion  -> data/bronze/reddit_posts.parquet          (raw, explicit schema)
                     |
 [2] Transform  -> data/silver/reddit_posts_clean.parquet    (filtered, deduped, features)
                     |
     +---------------+---------------+------------------+
     |               |               |                  |
 [3] Aggregations [4] Windows    [5] Enrichment     [6] Optimization
  leaderboard      rank, lag,     topic UDF +        repartition by
  hourly volume    rolling avg,   broadcast join     subreddit
  tier pivot       is_trending    to categories
     |               |               |                  |
 data/aggregations data/windows  data/enrichment   data/optimization
                     |
 [7] Output     -> data/gold/subreddit=.../day_of_week=.../  (silver, partitioned)
```

The diagram shows something the README's layout hides: stages 3 to 7 each read the **silver** table on their own. They do not feed each other. The gold layer is the silver table written again with `partitionBy("subreddit", "day_of_week")`. The trending flags, topics and categories live in side outputs under `data/windows` and `data/enrichment`, not in gold.

So "medallion" fits for bronze and silver. Gold is a re-partitioned copy of silver, not an aggregated or joined layer.

### Stage by stage

| Stage | What the code does | Output |
|---|---|---|
| 1 Ingestion | `requests.get` on `top.json` with `t=day`, `limit=100`; flattens 16 fields into `POST_SCHEMA` | bronze Parquet |
| 2 Transform | quality filters, `dropDuplicates(["id"])`, time features, engagement score, tiers, four flags, text cleanup | silver Parquet |
| 3 Aggregations | `groupBy` leaderboard (avg, sum, count, max), hourly counts, tier-by-subreddit pivot | 3 Parquet tables (2 more in the notebook version) |
| 4 Windows | `rank()` by engagement per subreddit, `lag` on score, 3-row rolling average, `is_trending` | `trending_posts.parquet` |
| 5 Enrichment | keyword topic UDF on titles, broadcast join to a 10-row category lookup | `enriched_posts.parquet` |
| 6 Optimization | `repartition(n, "subreddit")` where n is the distinct subreddit count; the notebook also times cache vs persist | repartitioned Parquet, `cache_benchmark.csv` (notebook only) |
| 7 Output | gold write partitioned by subreddit and day of week; the notebook also draws 3 charts | `data/gold/`, PNGs and CSV (notebook only) |

## Decision 1: an explicit schema at the bronze boundary

Reddit returns a lot of fields per post. I keep 16 and define them up front:

```python
POST_SCHEMA = StructType([
    StructField("id", StringType(), nullable=False),
    StructField("subreddit", StringType(), nullable=False),
    StructField("score", IntegerType(), nullable=True),
    StructField("num_comments", IntegerType(), nullable=True),
    StructField("upvote_ratio", DoubleType(), nullable=True),
    StructField("created_utc", LongType(), nullable=True),
    # ... 10 more
])
df = spark.createDataFrame(all_records, schema=POST_SCHEMA)
```

**Why:** schema inference on Python dicts can guess different types from one run to the next, for example when a field is null in every row of a sample. A fixed schema makes the bronze files the same shape on every run, and silver can trust it.

**Trade-off:** bronze is not truly raw. Anything I did not list, such as awards, crossposts and media metadata, is gone at ingestion and cannot be replayed later. A stricter medallion would land the JSON response as-is and apply the schema in silver. For a learning project with a 1,000-row ceiling, I chose the simpler path. I would not choose it for a source I could not re-fetch.

## Decision 2: a transparent engagement formula in silver

Silver drops rows that cannot be used: titles shorter than 5 characters, score below 1, authors that are null, `[deleted]`, `[removed]` or `AutoModerator`, and invalid timestamps. Then it adds one score:

```python
df = (
    df
    .withColumn("num_comments_clean", F.coalesce(F.col("num_comments"), F.lit(0)).cast(IntegerType()))
    .withColumn("engagement_score", F.col("score") + F.col("num_comments_clean") * F.lit(COMMENT_WEIGHT))  # weight = 3
    .withColumn("engagement_tier",
        F.when(F.col("engagement_score") >= 50_000, "viral")
         .when(F.col("engagement_score") >= 10_000, "high")
         .when(F.col("engagement_score") >= 1_000, "medium")
         .otherwise("low"))
)
```

It also sets four boolean flags. `is_brigaded` means `upvote_ratio < 0.5` and `score > 100`. `is_controversial` means more comments than upvotes. `is_link_post` and `is_external_link` check `is_self` and the domain against a short list of Reddit and Imgur hosts.

**Why:** a comment takes more effort than an upvote, so weighting comments three times is a defensible, readable rule. I used built-in `F.when` expressions instead of the `classify_engagement_tier` UDF in `src/udfs.py`, so Spark can optimise them and no Python worker is needed.

**Trade-off:** the weight and the tier cut-offs are my choices, not fitted to data. The same thresholds apply to r/todayilearned and r/datascience, which have very different audience sizes, so almost every datascience post may land in one tier. A per-subreddit percentile would be fairer. Also, the "brigaded" flag is a heuristic name for a low upvote ratio. It does not prove brigading.

## Decision 3: "trending" means top 3 by rank, from a single snapshot

The trending logic in stage 4 is short:

```python
w = Window.partitionBy("subreddit").orderBy(F.desc("engagement_score"))
df = df.withColumn("engagement_rank", F.rank().over(w))
df = df.withColumn("is_trending", F.col("engagement_rank") <= 3)
```

The stage also computes `score_velocity` and a "3h" rolling average. Reading the code honestly:

- `score_velocity` is `score - lag(score)` over posts ordered by `post_timestamp` within a subreddit. That is the score gap between a post and the post created just before it. It is not how fast one post is gaining score. One API snapshot cannot give real velocity.
- `rolling_avg_engagement_3h` uses `rowsBetween(-2, 0)`. That is the last three posts, not the last three hours.
- `rank()` keeps ties, so a subreddit can get more than three trending posts.
- The notebook's docstring says trending "combines multiple signals". The code uses only rank.

**Why I kept it this simple:** the data is one daily top listing per subreddit. Top-N by engagement is the most honest signal that data supports.

**Trade-off:** "trending" here means "most engaged in the last day", which Reddit's own `top?t=day` ordering already roughly gives you. To get real trending detection, I need repeated snapshots and a per-post time series.

## Smaller things worth knowing

The topic UDF (stage 5) checks title keywords with plain substring matches, in a fixed order: ai, crypto, climate, war, sports, politics, tech, science. Substrings cause false hits. "ai" matches "said" and "again". "software" contains "war", and war is checked before tech, so a software headline gets the war tag. Word-boundary regex in `F.regexp_extract` or `rlike` would fix this and also remove the Python UDF cost.

The broadcast join in stage 5 joins about 1,000 posts to a 10-row lookup. That shows the API and the `BroadcastHashJoin` plan, which the notebook prints with `explain()`. At this size it says nothing about performance.

## Results

Here is what I can say from the repository:

- It ingests up to 1,000 live posts per run (10 subreddits × 100) with a 1-second pause between requests.
- It writes 7 kinds of output: bronze, silver, 3 aggregation tables, ranked and flagged posts, topic-enriched posts, a repartitioned copy, and a gold layer partitioned by `subreddit` and `day_of_week`.
- The stage scripts print their own checks, for example rows before and after the quality filter, null counts per column, and a read-back count after each write.

Here is what I cannot claim. The repo has no committed run outputs, row counts, timings or charts. The leaderboard and trending tables under "Sample Output" in the README are placeholders (post ids like `abc123`), not results from a committed run. And this is not "at scale". It is a single-machine job over about 1,000 rows.

!!! note "A bug I found while writing this"
    `src/pipeline.py` stage 1 starts with `from notebooks.ingestion import fetch_all_subreddits, POST_SCHEMA, BRONZE_PATH`. There is no `notebooks/ingestion.py` (the file is `01_ingestion.py`), and `notebooks/` has no `__init__.py`. As committed, `python -m src.pipeline` should fail before it fetches anything. The per-stage scripts in `notebooks/` do not have this problem. The import is dead code anyway, because the function redefines everything it needs, so the fix is to delete that line.

## What I'd do next

1. **Fix the orchestrator import** and add a smoke test that runs all seven stages on a small saved JSON fixture, so the main entry point is checked on every commit.
2. **Land raw JSON in bronze** and move the schema to silver, so I can re-process history after a schema change.
3. **Snapshot on a schedule** (for example hourly), append with a `snapshot_ts` column, and compute real per-post velocity with `lag` over `id` ordered by snapshot time. Use `rangeBetween` on timestamps for true time windows.
4. **Build a real gold layer**: join the trending, topic and category columns into one table, partitioned by `post_date` instead of day name, so queries can prune by date.
5. **Replace the Python UDFs** with built-in expressions, and match topics on word boundaries.
6. **Commit one real run's outputs** (row counts, filter drop rates, the leaderboard) so the results section can show numbers instead of only describing code.

## Links

- Code: [github.com/Eng-Zakaria/reddit-spark-pipeline](https://github.com/Eng-Zakaria/reddit-spark-pipeline)
- Case page: [Reddit Spark Pipeline](../projects/reddit-spark-pipeline.html)
