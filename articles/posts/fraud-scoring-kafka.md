---
title: "Fraud scoring on Kafka: design, alerts and next steps"
date: 2026-11-08
summary: "A code-level walkthrough of my Kafka fraud-scoring project: a scikit-learn model behind a consumer and an API, three alert rules, and a 6-hour retraining loop. This post covers what the code does, the three design decisions that shaped it, and the next steps."
tags: [Streaming, Machine Learning, Kafka]
draft: false
---

**Evidence label: Portfolio, synthetic data.** This is a personal project, not client work. Every transaction in it comes from a Python generator with a fixed 2% fraud rate. This post describes the design and the code; latency and model metrics are the next measurements.

## The problem

Card fraud has to be caught while the payment is still being authorised. A nightly batch job that flags a transaction the next morning is too late. I wanted to build the parts a streaming fraud system needs: an event stream, a model that scores each event, a way to push alerts, a dashboard, and a loop that retrains the model.

Latency isn't measured yet; next is p50/p95 over a replay. Monitoring today is fraud-rate and AUC-degradation alerts; feature drift (PSI) is next.

## Architecture

The stack runs in Docker Compose: Postgres 15, Redis 7, Zookeeper and Kafka (Confluent 7.4.0), Airflow 2.7.3 and an MLflow server. The Python services (the API, the Kafka consumer, the dashboard and the monitoring loop) are started by hand with `python -c ...`. They are not in the Compose file and there is no Dockerfile.

```text
 TransactionStreamSimulator             Airflow DAG (every 6 h)
 (synthetic, 10 tx/s default)           generate -> clean -> load -> train -> evaluate
            |                                                |           |
            v                                                v           v
   Kafka topic "transactions" <---- key: transaction_id     MLflow     Postgres
            |                                              (runs)     model_metrics
            v                                                            |
 TransactionKafkaConsumer ---+                                           |
 (group fraud_detection_group)|      FastAPI /predict, /predict/batch   |
            |                 +----> FraudDetector (scikit-learn) <-----+ |
            |                         score + risk tier                   |
            v                                                             |
   Kafka topic "fraud_alerts"   (no consumer in the repo)                 |
                                                                          v
   MonitoringSystem (polls Postgres every 300 s) ----> Slack / email / webhook
   Plotly/Dash dashboard (refreshes every 30 s, reads Postgres)
   Redis: daily counters only (stats:YYYY-MM-DD)
```

The model code trains Random Forest, Gradient Boosting and Logistic Regression, picks the one with the best validation AUC-ROC, optionally runs a grid search, and logs runs to MLflow. Features are temporal (hour, weekday, cyclical encodings), amount statistics, per-user history, distance from the user's usual location, device reuse, and merchant statistics. Every numeric column is passed through a `StandardScaler` and any column ending in `_scaled` or `_encoded` becomes a model input.

## Decision 1: one detector object behind two entry points

Both the Kafka consumer and the FastAPI service call the same method, `FraudDetector.predict_single`. That kept the scoring logic in one place, which I still think is right. The trade-off sits in how that method builds features:

```python
def predict_single(self, transaction: Dict) -> Tuple[int, float]:
    df = pd.DataFrame([transaction])
    predictions, scores = self.predict(df)
    return predictions[0], scores[0]
```

`predict` calls `create_feature_matrix(df, historical_data=None, ...)`, and every feature function then does `historical_data = df.copy()`. For a single event that means the "user history" is one row: the user's average amount is this amount, and the seven-day transaction count is zero. The features that make fraud models useful (how this payment compares with the user's normal behaviour) are flat at scoring time. The next iteration reads user aggregates from a store (Redis is already running) instead of rebuilding them from the request.

The same change adds `transaction_time` to the API request schema, since the cleaner and its business rules depend on it, and moves merchant features off `is_fraud`, which a live request does not have.

## Decision 2: risk tiers from three config thresholds

I wanted more than a yes/no answer, so the score maps to a tier and the tier decides whether an alert is sent:

```python
if fraud_score >= config.HIGH_RISK_THRESHOLD:      # 0.8
    risk_level = "HIGH"
elif fraud_score >= config.MEDIUM_RISK_THRESHOLD:  # 0.6
    risk_level = "MEDIUM"
elif fraud_score >= config.FRAUD_THRESHOLD:        # 0.7
    risk_level = "LOW"
```

The trade-off I chose was simplicity: three constants in `config.py`, the same block copied into the consumer and the API. The cost is that copies can drift: as written, 0.6 sits below 0.7, so the `LOW` branch never runs and any score of 0.6 or more becomes `MEDIUM`. One tier function with a test per boundary is the fix.

Each alert is published to a Kafka topic, `fraud_alerts`; a small consumer that forwards HIGH alerts to Slack is the next piece.

## Decision 3: aggregate monitoring instead of per-event paging

Slack, email and webhook delivery live in `AlertManager`, driven by a `MonitoringSystem` thread that wakes every 300 seconds and runs four checks against Postgres:

| Check | Rule in the code | Severity |
|---|---|---|
| Fraud spike | last hour's fraud rate is more than 3x the previous hour's | HIGH |
| High fraud rate | last hour's fraud rate is above 10% | CRITICAL |
| Model performance | latest stored AUC-ROC is below 0.9x a value from the past 24 h, or below 0.7 | HIGH / CRITICAL |
| System health / data quality | Redis or Kafka unreachable; null or non-positive amounts, null user IDs | HIGH / MEDIUM |

Polling every five minutes is cheap and avoids paging someone for every flagged card, which I think is the right call for a team. These are fraud-rate and AUC-degradation alerts; both rely on labels, which here come from the generator. Feature drift is the next layer: PSI per feature against a training snapshot, on a schedule.

Retraining is a schedule rather than a trigger. The Airflow DAG runs every six hours. Nothing in the monitoring code starts it when AUC drops.

## What holds up

The module layout is clean, the Kafka producer uses `acks='all'` with retries, the trainer computes AUC-ROC, PR-AUC, precision, recall and F1 and logs them to MLflow with stratified and time-series cross-validation paths, there are unit tests for ingestion, preprocessing and modelling, and the dashboard has seven Dash callbacks that re-query Postgres every 30 seconds.

## Next steps

1. **Clean the feature set.** Drop the generator's `fraud_score` column and label-derived merchant rates from the model inputs, and compute merchant rates only from data older than the training window.
2. **Align training and serving, then benchmark.** Point the API at the model path training writes, serve per-user aggregates from Redis, and record p50/p95 latency over a replay of a few thousand events.
3. **Add feature drift and close the alert loop.** PSI per feature against a training snapshot on a schedule, a consumer on `fraud_alerts` that forwards HIGH alerts to Slack, and the services added to Docker Compose.

## Links

- Case study: [Fraud Detection](../projects/fraud-detection.html)
- Code: [github.com/Eng-Zakaria/Fraud_Detection](https://github.com/Eng-Zakaria/Fraud_Detection)
