---
title: "Fraud scoring on Kafka: what is built, what is measured, what is missing"
date: 2026-11-08
summary: "A code-level walkthrough of my Kafka fraud-scoring project: a scikit-learn model behind a consumer and an API, three alert rules, and a 6-hour retraining loop. This post covers what the code does, the three design decisions that shaped it, and what turned out to be unsupported or broken."
tags: [Streaming, Machine Learning, Kafka]
draft: false
sources:
  - Fraud_Detection/README.md
  - Fraud_Detection/docker-compose.yml
  - Fraud_Detection/src/utils/config.py
  - Fraud_Detection/src/data_ingestion/data_generator.py
  - Fraud_Detection/src/data_ingestion/kafka_producer.py
  - Fraud_Detection/src/preprocessing/data_cleaner.py
  - Fraud_Detection/src/preprocessing/feature_engineering.py
  - Fraud_Detection/src/modeling/fraud_detector.py
  - Fraud_Detection/src/modeling/model_trainer.py
  - Fraud_Detection/src/real_time/kafka_consumer.py
  - Fraud_Detection/src/real_time/fraud_api.py
  - Fraud_Detection/src/monitoring/alerting.py
  - Fraud_Detection/src/monitoring/dashboard.py
  - Fraud_Detection/dags/fraud_detection_dag.py
  - Fraud_Detection/tests/test_modeling.py
---

**Evidence label: Portfolio, synthetic data.** This is a personal project, not client work. Every transaction in it comes from a Python generator with a fixed 2% fraud rate. The repository has one commit and no saved metrics, logs, benchmark results or trained models. So this post describes what the code does and what I found when I read it closely. It does not report any measured latency or model accuracy, because none was recorded.

## The problem

Card fraud has to be caught while the payment is still being authorised. A nightly batch job that flags a transaction the next morning is too late. I wanted to build the parts a streaming fraud system needs: an event stream, a model that scores each event, a way to push alerts, a dashboard, and a loop that retrains the model.

The README for this project promises "Sub-second fraud prediction on incoming transactions", and I had planned drift-aware monitoring. Before writing about the project I checked both against the code. Short version: neither one is there yet. This post explains why, because the gap between the README and the code taught me more than the code did.

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

`predict` calls `create_feature_matrix(df, historical_data=None, ...)`, and every feature function then does `historical_data = df.copy()`. For a single event that means the "user history" is one row: the user's average amount is this amount, and the seven-day transaction count is zero. The features that make fraud models useful (how this payment compares with the user's normal behaviour) are flat at scoring time. A real design would read user aggregates from a store (Redis was the obvious place, and it is already running) instead of rebuilding them from the request.

There is a second cost. The cleaner drops rows without `transaction_time`, and its business rules read that column directly. The FastAPI `TransactionRequest` model has no `transaction_time` field. Reading the code, a `/predict` call should fail inside the cleaner and return HTTP 500. The merchant features also group by `is_fraud`, which a live request does not have.

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

The trade-off I chose was simplicity: three constants in `config.py`, the same block copied into the consumer and the API. The cost is that the copies drifted from the intent and nobody noticed. Because 0.6 is below 0.7, the `LOW` branch can never run. Any score of 0.6 or more becomes `MEDIUM` and sends an alert, even though the "fraud" threshold is 0.7. A single function with a test for each boundary would have caught this.

Each alert is published to a Kafka topic, `fraud_alerts`. Nothing in the repository consumes that topic. Per-transaction alerts therefore never reach Slack or email.

## Decision 3: aggregate monitoring instead of per-event paging

Slack, email and webhook delivery live in `AlertManager`, driven by a `MonitoringSystem` thread that wakes every 300 seconds and runs four checks against Postgres:

| Check | Rule in the code | Severity |
|---|---|---|
| Fraud spike | last hour's fraud rate is more than 3x the previous hour's | HIGH |
| High fraud rate | last hour's fraud rate is above 10% | CRITICAL |
| Model performance | latest stored AUC-ROC is below 0.9x a value from the past 24 h, or below 0.7 | HIGH / CRITICAL |
| System health / data quality | Redis or Kafka unreachable; null or non-positive amounts, null user IDs | HIGH / MEDIUM |

Polling every five minutes is cheap and avoids paging someone for every flagged card, which I think is the right call for a team. But this table is the whole "drift-aware" story. There is no feature-distribution check: no PSI, no KS test, no comparison of live inputs against training data. The AUC rule needs labelled outcomes, and the fraud-rate rules count `is_fraud = TRUE` rows. In this project those labels come from the generator, so the checks are measuring the simulator. Calling this "drift detection" was an overstatement. "Performance-degradation and fraud-rate alerts" is accurate.

!!! warning "The alerting module does not import"
    `alerting.py` starts with `from email.mime.text import MimeText`. The real class is `MIMEText`, and Python 3.13 raises `ImportError` on that line. Since `src/monitoring/__init__.py` imports `alerting`, both the monitoring loop and the dashboard fail at import until that name is fixed.

Retraining is a schedule rather than a trigger. The Airflow DAG runs every six hours. Nothing in the monitoring code starts it when AUC drops.

## Results

There are no numbers to report, and I would rather say that than make some up.

- **Latency.** Nothing measures it. The `processing_time` field returned by the API and the consumer is `datetime.utcnow().isoformat()`, a timestamp and not a duration. No benchmark or load test exists. "Sub-second" comes from one line in the README.
- **Model metrics.** `train()` computes AUC-ROC, PR-AUC, precision, recall and F1 and logs them to MLflow, but no MLflow runs, reports or model files are in the repo (`models/*.joblib` and `reports/*.json` are git-ignored).
- **Tests.** There are unit tests for ingestion, preprocessing and modelling. I did not run them because `kafka-python` and `mlflow` are not installed on this machine, and I did not want to change the environment just to write this post.

Reading the code turned up problems that would make any metric from this pipeline unreliable:

1. **Label leakage.** The generator writes a `fraud_score` column drawn from 0.7-1.0 for fraud and 0.0-0.3 for legitimate rows. It is numeric and not excluded from scaling, so `fraud_score_scaled` becomes a model input that encodes the label. `merchant_fraud_rate` and `category_fraud_rate` are also computed from `is_fraud` on the same rows. Expect a near-perfect AUC that means nothing.
2. **The API cannot find the model.** Training saves `models/best_model_<name>_<timestamp>.joblib`. The API loads the fixed path `models/best_model_random_forest.joblib`.
3. **The DAG's training task ignores its data.** It queries 30 days of transactions, then calls `automated_training_pipeline(data_source='dataframe')`. That falls through to `pd.read_csv('dataframe')`.
4. **`pd` is not imported in `fraud_api.py`**, so the background task that saves scored transactions fails (the error is caught and logged).
5. **The stream simulator likely sends nothing.** `to_dict('records')` keeps pandas `Timestamp` objects, which `json.dumps` cannot serialise. I did not run this, so treat it as a likely bug.

What does hold up: the module layout is clean, the Kafka producer uses `acks='all'` with retries, the consumer commits offsets after each poll, the trainer has stratified and time-series cross-validation paths, and the dashboard has seven Dash callbacks that re-query Postgres every 30 seconds.

## What I'd do next

1. **Remove the leaks first.** Drop `fraud_score` and any label-derived merchant rates from the feature set. Compute merchant rates only from data older than the training window.
2. **Serve features from history.** Keep per-user aggregates (mean amount, seven-day count, usual location, known devices) in Redis, update them in the consumer, and read them in `predict_single`. Add `transaction_time` to the request schema.
3. **Measure latency for real.** Time `predict_single` with `time.perf_counter()`, record p50, p95 and p99 over a replay of a few thousand events, and save the results to the repo. Only then put a number on the card.
4. **Add actual drift checks.** Compare live feature distributions with a training snapshot using PSI per feature on a schedule, and alert on it. Keep the AUC check for when labels arrive.
5. **Close the alert loop.** Add a small consumer on `fraud_alerts` that writes to the `fraud_alerts` table and forwards HIGH alerts to Slack. Put one tier function behind tests for each threshold boundary.
6. **Containerise the services** so `docker compose up` starts the API, consumer and dashboard too.

## Links

- Case study: [Fraud Detection](../projects/fraud-detection.html)
- Code: [github.com/Eng-Zakaria/Fraud_Detection](https://github.com/Eng-Zakaria/Fraud_Detection)
