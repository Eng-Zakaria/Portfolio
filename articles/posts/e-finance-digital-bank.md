---
title: "E-Finance: a six-service digital bank scaffold, and where the money logic lives"
date: 2026-11-08
summary: "A portfolio scaffold for a digital bank: a FastAPI core-banking API, a Spring Boot transaction service, four smaller Python services, a Postgres schema and three Airflow DAGs in one Docker Compose file. What each part does today, how money movements are kept consistent, and what still has to be wired before it runs end to end."
tags: [Microservices, Docker, Data Engineering]
draft: false
---

This is a portfolio project with no production deployment and no real customer data. E-Finance is a scaffold for a digital bank: six backend services, a React web app, a Postgres schema and three Airflow DAGs, all declared in one Docker Compose file. The core-banking API holds most of the real logic. The other services are thinner, and several still run on in-memory dictionaries or generated sample data. Below I cover what the code does, the decisions behind it, and what is left before the stack runs end to end.

## The problem

A bank has two kinds of work that pull against each other. On the request path it has to move money correctly: a transfer debits one account and credits another, or neither happens. Off the request path it needs batch jobs: interest accrual, daily summaries, and fraud review over recent activity. I wanted one repository that showed both sides. That meant a service split I could defend, a schema that stores money safely, and a data layer that Airflow could run batch jobs against.

## Architecture

Docker Compose declares six backend services, plus the frontend, Postgres, MongoDB, Redis, ZooKeeper and Kafka, an Airflow webserver and scheduler, Prometheus and Grafana.

| Service | Stack | What the code does today |
|---|---|---|
| core-banking-api | FastAPI, SQLAlchemy async | Auth, users, accounts, cards, transactions: 44 routes over Postgres. Deposits, withdrawals and internal transfers update balances. |
| transaction-service | Spring Boot, JPA | 10 REST routes. Saves transaction records to its own database and publishes them to the Kafka topic `transactions`. |
| fraud-detection | FastAPI, scikit-learn | Scores a transaction on request: 8 hand-written rules blended with a random forest and an isolation forest. |
| bnpl-service | FastAPI | Credit score from 300 to 850, built from four weighted factors. Orders and merchants live in in-memory dicts. |
| web3-service | FastAPI, web3.py | Creates wallets and encrypts their keys with Fernet. Wallets are held in memory. |
| analytics-service | FastAPI, PySpark | Daily volume, account summaries, moving averages and segments, computed over five hard-coded sample rows. |

This is how data moves in the code as it stands:

```text
React app ──HTTP──> core-banking-api ──> Postgres: efinance_core
                                           (users, accounts, transactions,
                                            cards, fraud_alerts, audit_logs,
                                            daily_transaction_summary,
                                            user_velocity_metrics)
                                                 ^
Airflow (LocalExecutor) ──PostgresHook──────────┘
  transaction_etl     02:00 daily   extract -> transform -> load / velocity upsert
  interest_calc       00:00 daily   accrue -> credit on the 1st of the month
  fraud_detection     every 15 min  flagged txns -> fraud_alerts

transaction-service ──> Postgres: efinance_transactions (separate table)
        └──produce──> Kafka topic "transactions"   (no consumer in the repo)

fraud / bnpl / web3 / analytics: called directly on their own ports;
no service calls another over HTTP today.
```

The README draws an API gateway (Kong), Elasticsearch and a notification service. None of them are in the Compose file or the code. Elasticsearch shows up only as a config field and a pinned client library.

## Decision 1: store money as integer minor units, and write both legs of a transfer in one commit

Every balance and amount column in the schema is `BIGINT` in the smallest currency unit, and the ORM maps them to `Integer`. The account model formats them by dividing by 100, or by 10^8 for crypto. That keeps floating-point rounding out of the ledger. The cost is that every caller has to agree on the unit, and the Java service's `Long` fields depend on the same convention without anything enforcing it.

An internal transfer in `account_service.py` writes two transaction rows: a `TRANSFER_OUT` on the source account and a `TRANSFER_IN` on the destination. Each row records `balance_before` and `balance_after`. Both balances change, and then a single commit runs:

```python
from_account.balance -= data.amount
from_account.available_balance -= data.amount
to_account.balance += data.amount
to_account.available_balance += data.amount

self.session.add(debit_tx)
self.session.add(credit_tx)
await self.session.commit()
```

The two legs and both balance updates sit in one database transaction, so a failure part-way leaves no half-transfer behind. Same-currency transfers only: cross-currency requests are rejected. Ownership, account status, daily and monthly limits and minimum balance are checked before any write.

The design is two-leg, but it is not a full double-entry ledger. There is no separate journal, and nothing checks that debits and credits sum to zero. Balances are a read-modify-write on the account row with no `SELECT ... FOR UPDATE` and no version column. Two transfers running at once from the same account can therefore both pass the balance check. The API also takes no idempotency key. Reference numbers come from a timestamp plus six random characters, and the schema has a `UNIQUE` constraint on them, but a client that retries a transfer creates a second one.

## Decision 2: a separate Java service for transaction records, with Kafka as the outbound edge

I put a Spring Boot transaction service next to the Python API. It writes transaction records and emits events, and the idea was that downstream consumers (fraud scoring, search, analytics) would read the `transactions` topic and leave the core API's database alone. `processTransaction` saves a record as `PENDING`, sets it to `PROCESSING`, and publishes it with the reference number as the Kafka key, which keeps the events for one transaction in order on a single partition.

Three things limit this today. First, the Kafka send runs inside the `@Transactional` method, before the database commit. If the commit fails, an event may already be out; if the send fails, the error is logged and swallowed. An outbox table would close that gap. Second, nothing in the repo consumes the topic. Third, the Java service has its own `efinance_transactions` database and its own transactions table, separate from the one the core API writes. It takes `balanceBefore` and `balanceAfter` from the request body and never touches an account balance. The fraud call in `FraudCheckService` is built but commented out, so no service scores a transaction on the money path.

## Decision 3: put batch work in Airflow, against the same Postgres

Daily jobs run as Airflow DAGs that use `PostgresHook`, not as background tasks inside the API. That keeps scheduling, retries and run history in one place, and it keeps the API process free of cron logic.

- **transaction_etl** (02:00): pulls the day's completed transactions, then upserts into `daily_transaction_summary` with `ON CONFLICT (date) DO UPDATE` and into `user_velocity_metrics` with `ON CONFLICT (user_id, date)`. These upserts make re-runs safe: running a day again overwrites its rows instead of duplicating them. The velocity step is a real aggregate join across users, accounts and transactions.
- **interest_calculation** (midnight): accrues `balance × rate / 365` into `interest_accrued` for savings and fixed-deposit accounts. On the 1st of the month it writes an `interest` transaction and moves the accrued amount into the balance.
- **fraud_detection** (every 15 minutes): reads unreviewed suspicious transactions from the last hour, groups them by account, and writes `fraud_alerts`.

The trade-off is that DAGs write straight to the operational tables. That is fine at this size, but it couples the jobs to the API's schema.

!!! note "Gaps in the DAGs"
    The ETL `transform` step returns a fixed dictionary (`total_volume: 1000000`, `transaction_count: 500`), not an aggregate of the extracted rows. The load step points at an `efinance_warehouse` connection, and the init scripts create no warehouse database. The extract filters `status = 'COMPLETED'` while the interest DAG writes `'completed'`. The interest DAG runs each statement as its own `hook.run`, so the transaction insert and the balance update are not atomic. Daily accrual sets `last_interest_calculated` but never checks it, so re-running a date accrues interest twice.

## Security as written

The core API has the most complete auth. JWTs are HS256, with 30-minute access tokens and 7-day refresh tokens checked by type. Passwords are hashed with bcrypt. Five failed logins lock the account for 30 minutes. TOTP 2FA can be enabled and disabled, and admin and super-admin routes check roles. Every account route checks that the caller owns the account before it reads or moves money.

The weak points are configuration and the other services. `config.py` ships default values for the app and JWT secrets. The Compose file and `application.yml` hold plaintext database passwords, the Airflow Fernet key is a placeholder string, and Grafana uses a default admin password. Fraud, BNPL, web3 and analytics have no authentication, and fraud-detection allows CORS from any origin. The web3 service derives its encryption key with a fixed salt, and its RPC default points at an Ethereum mainnet URL placeholder. For a local scaffold that is acceptable. Before anything else it would need a secrets store and service-to-service auth.

## Results

What the repository contains:

- 6 backend services; about 5,400 lines in the core API and about 14,200 lines across services, DAGs, schema and frontend.
- 93 FastAPI routes across the Python services (44 in core banking) and 10 Spring routes.
- A 320-line Postgres schema with 10 tables, indexes and `updated_at` triggers.
- 3 Airflow DAGs with idempotent upserts in the ETL load and velocity steps.
- Prometheus scrape config for all six services.
- The Java service has compiled classes under `target/`.

## Next steps

1. **Boot the full stack.** Add Dockerfiles for the three services that don't have one yet (core banking, fraud and transaction do), tidy the core API's middleware imports, add one smoke test per service, and train the fraud models on saved data instead of placeholder arrays.
2. **Make money movement safe.** Lock balances during transfers with `SELECT ... FOR UPDATE` or a version column, accept a stored `Idempotency-Key`, and keep one transaction store that publishes through an outbox table to a Kafka consumer.
3. **Harden the DAGs.** Aggregate the extracted rows in the ETL transform, create the warehouse database, normalise status casing, and make interest accrual atomic and guarded by `last_interest_calculated`.
4. **Secrets and service auth.** Move secrets into environment files kept out of git, and put the gateway in front of the services that have no auth today.

## Links

- Case page: [E-Finance case study](../projects/e-finance.html)
