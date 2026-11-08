---
title: "Masking on-chain data for GDPR: what a privacy gate can and can't do"
date: 2026-11-08
summary: "A design review of a privacy layer for Ethereum, Bitcoin and market data: regex PII masking, address truncation, an audit-log table and retention scheduling. What the code implements, where data still gets through, and what it would take to make the controls hold."
tags: [Data Privacy, Data Governance, Blockchain]
draft: false
sources:
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/compliance/masking.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/compliance/audit.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/storage/models.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/storage/operations.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/blockchain/ethereum.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/blockchain/bitcoin.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/src/api/main.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/config/settings.py
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/docker-compose.yml
  - Blockchain_GDPR_Transaction_Data_Aggregator/CascadeProjects/Blockchain GDPR Transaction Data Aggregator/tests/test_compliance.py
---

**Evidence: Portfolio prototype, reviewed from source code only.** The project has never been run end to end, there are no saved outputs or logs, and the numbers below are counts and defaults read from the code, not measurements. This is a write-up of the design, the controls it implements, and where they stop short.

## The problem

Blockchain data is public by design, but that does not make it free of personal data. A wallet address is a stable identifier. Once anyone links it to a person (an exchange KYC record, a forum post, an invoice), every past and future transaction from that address is linked too. Under GDPR, data that can be tied back to a person with reasonable effort is still personal data, even if it is pseudonymised.

I wanted an analytics service that pulls Ethereum blocks, Bitcoin transactions and market prices, and puts a privacy layer in front of everything it serves: mask identifiers and free-text PII, record what was processed, and schedule deletion. The goal was a set of concrete controls, not a compliance label. Whether a real deployment meets GDPR depends on lawful basis, purpose, contracts and process, which code alone cannot settle.

## Architecture

The service is a FastAPI app with ingestors for Ethereum (web3.py over HTTP) and Bitcoin (raw JSON-RPC via `requests`), a market aggregator (ccxt for Binance, plus CoinGecko and Alpha Vantage over aiohttp), a networkx/pandas flow analyser, and a SQLAlchemy storage layer targeting PostgreSQL. Every ingestor passes its records through one module-level `CompliancePipeline` before returning them.

```text
 Ethereum RPC     Bitcoin RPC     Binance / CoinGecko / Alpha Vantage
      |               |                        |
      v               v                        v
 EthereumIngestor  BitcoinIngestor       MarketAggregator
      \               |                        /
       \              v                       /
        +--> CompliancePipeline (masking.py) <+
               - truncate from/to addresses
               - regex PII scan + mask_dict
               - compliance_metadata report
                        |
          +-------------+--------------+
          v                            v
   FastAPI responses            FlowAnalyzer (networkx)
                                       |
                    AuditLogger.log_data_processing()
                    -> audit_logs table (one row per call)

   storage/operations.py: store_*() + DataRetention rows   (not called by ingestors)
```

The last line matters. The storage functions exist and schedule a retention row for each record they write, but no ingestor or endpoint calls them. In the current code, masked data goes straight to API responses and the flow analyser.

## Decision 1: mask on ingest, with truncation instead of keyed pseudonyms

`DataMasker` has 8 regex patterns (email, phone, SSN, card number, IBAN, street address, IPv4, wallet address), a list of 11 sensitive field names, and four modes: `partial`, `full`, `hash` and `tokenize`. Sender and recipient addresses get special handling that keeps their shape:

```python
# Ethereum address
if address.startswith('0x') and len(address) == 42:
    return address[:6] + '*' * 32 + address[-4:]
# Bitcoin address
elif len(address) >= 26 and len(address) <= 35:
    return address[:4] + '*' * (len(address) - 8) + address[-4:]
```

The trade-off I chose was readability and schema fit over strength. A masked Ethereum address is still 42 characters, so it fits the `String(42)` column, and an analyst can still eyeball `0x1a2b…9f0e`. The cost is that this is truncation, not pseudonymisation in any strong sense. Eight hex characters from a public ledger are enough to search for candidate matches, so anyone with chain access can re-identify most masked addresses. The `hash` mode (unsalted SHA-256, cut to 16 hex characters) and `tokenize` mode (unsalted MD5) have the same weakness: the full set of addresses is public, so an attacker can hash all of them and build a lookup table.

Reviewing the data flow showed two more gaps:

- **Nested lists are not scanned.** `mask_dict` recurses into dicts, and into lists of dicts, but returns plain strings inside lists unchanged. Bitcoin output addresses sit in `script_pub_key.addresses` (a list of strings), so they pass through unmasked. Ethereum log `topics` also go through untouched, and for ERC-20 `Transfer` events those topics hold the sender and recipient addresses.
- **Two masking schemes for one address.** Top-level `from_address` keeps 6+4 characters, but a log's `address` field matches the generic `address` field name and gets `partial` masking (2+2). The same contract shows up in two different masked forms, which breaks joins in the flow graph.

!!! note "What would make this hold"
    Replace truncation with a keyed HMAC (secret key held outside the dataset, rotated, with access logged). Run every string the pipeline sees through the scanner, including list items, log topics and calldata. Then the flow graph can still join on a stable pseudonym, and someone without the key cannot reverse it.

## Decision 2: an audit table written from the processing path

`AuditLogger` writes rows to an `audit_logs` table with user, action, resource, IP, user agent, request and response JSON, a success flag and simple compliance flags (keywords such as `ssn` or `private_key` in the request, `limit > 1000` marked as bulk access). The flow analyser and market aggregator call `log_data_processing()`, which stores record counts and `processing_time_ms`.

The trade-off is simplicity against volume and coverage. Writing synchronously from the processing path is easy to reason about, but `FlowAnalyzer.add_transaction()` writes one audit row per transaction, plus one per batch. That is a database round trip for every transaction. The bigger issue is coverage. The API never calls `log_access()`, so reads of the served data are not audited. `log_data_export()` (labelled Article 20) and `log_data_deletion()` (labelled right to erasure) exist, but nothing calls them, and no export or deletion feature exists for them to record.

There is also a tension in what the log keeps. It stores IP addresses and raw request payloads for a default of 2,555 days (about seven years). An audit trail is itself personal data, so a long retention period needs a documented reason and its own minimisation.

## Decision 3: retention as a ledger of scheduled deletions

Instead of a cron job that deletes by `created_at`, I put a `DataRetention` table next to the data. Each stored record would get a row with `table_name`, `record_id`, `retention_days` (default 365) and `deletion_scheduled_at`. `cleanup_expired_data()` deletes matching Ethereum, Bitcoin and market rows, then marks the ledger entry `is_deleted` with a timestamp and reason. This gives a record of what was deleted and when, which a plain `DELETE … WHERE created_at < …` does not.

The trade-off is one extra write per record and a second table that has to stay consistent with the first. In this codebase it never runs. The `store_*` functions that schedule retention are not called, and nothing schedules `cleanup_expired_data()` or `AuditLogger.cleanup_old_logs()`. The compose file starts Celery worker and beat containers with `-A src.utils.celery`, but that module does not exist.

On erasure: deleting a row from my database does not remove anything from Ethereum or Bitcoin. The realistic scope for this kind of system is erasing its own copies and derived data (stored rows, flow-analysis results, logs), and not re-ingesting data that is linked to a subject who asked for erasure. A suppression list keyed on the HMAC pseudonym from Decision 1 would handle the second part. Neither is built yet.

## Results

There are no runtime results: no throughput, latency or masking-accuracy numbers. What I could verify from the code is below.

| Control | State in code |
|---|---|
| Regex PII detection | 8 patterns, 4 mask modes, 11 sensitive field names |
| Address masking | Implemented as truncation; misses list items, log topics and calldata |
| Fernet encryption | Methods exist but nothing calls them; key handling would fail at startup (see below) |
| Audit log | Table and writer implemented; called from processing paths only, not API reads |
| Export / erasure trail | Logging helpers only; no export or erasure feature |
| Retention | Ledger table and cleanup implemented; not wired or scheduled |
| Access control | None; the API docs say there is no authentication; CORS allows `*` |
| Rate limiting | Described in API docs (100/min, 1,000/hour) but not implemented |
| Tests | 31 test functions (11 for compliance); no recorded run |

Two startup blockers explain why there is no recorded run. `config/settings.py` imports `BaseSettings` from `pydantic`, but `requirements.txt` pins pydantic 2.5.0, where that import was removed. The encryption key setup also contradicts itself: the validator requires exactly 32 characters, the default key is 34 characters, and Fernet needs a 44-character url-safe base64 key, so a key that passes the validator would still be rejected by `Fernet()`. Since `compliance_pipeline` is created when the module is imported, either problem stops the app from starting. One compliance test also expects partial masking to keep four leading characters (`0x12`), while `mask_field` keeps two.

## What I'd do next

1. **Make it start.** Move to `pydantic-settings`, take a real Fernet key from a secret store, and fail fast with a clear message. Run the 31 tests and record the result.
2. **Keyed pseudonyms.** HMAC-SHA256 with a managed key for every address, applied to every string in the payload, including list items, log topics and decoded calldata. Encrypt anything that needs to be reversible, such as optional labels, with envelope encryption, and log every decrypt.
3. **Wire storage and retention.** Have ingestors call `store_*`, add a real Celery app, and schedule both cleanups. Record deletions in the ledger and alert when a cleanup stops running.
4. **Erasure scope and suppression.** An erasure endpoint that deletes a subject's stored rows and derived results, and adds their pseudonym to a suppression list that ingestion checks.
5. **Audit the read path.** Authentication, a `log_access` call on every endpoint, request bodies minimised before they are stored, and a shorter, justified audit retention period.

## Links

- Case study: [Blockchain GDPR Aggregator](../projects/blockchain-gdpr-aggregator.html)
- Source: local project, not published on GitHub.
