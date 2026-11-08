---
title: "A telecom lakehouse for 8 domains: the blueprint, and what runs today"
date: 2026-11-08
summary: "A portfolio design for a telecom medallion lakehouse with eight domain marts and an Azure/Fabric target. The synthetic generators and ML modules run under pytest; the Spark, Great Expectations, dbt and Terraform layers are written but have not been executed or deployed."
tags: [Lakehouse, Data Quality, Azure]
draft: false
sources:
  - Telecom-Data-Automation-Platform/README.md
  - Telecom-Data-Automation-Platform/docs/architecture.md
  - Telecom-Data-Automation-Platform/docs/decisions/ADR-001-local-cloud-parity.md
  - Telecom-Data-Automation-Platform/docs/decisions/ADR-002-terraform-vs-fabric-cli.md
  - Telecom-Data-Automation-Platform/docs/decisions/ADR-005-ci-cd-promotion.md
  - Telecom-Data-Automation-Platform/ingestion/cdr_generator/cdr_generator.py
  - Telecom-Data-Automation-Platform/ingestion/network_kpi_generator/network_kpi_generator.py
  - Telecom-Data-Automation-Platform/ingestion/billing_generator/billing_generator.py
  - Telecom-Data-Automation-Platform/pipelines/bronze/pipeline.py
  - Telecom-Data-Automation-Platform/pipelines/silver/pipeline.py
  - Telecom-Data-Automation-Platform/pipelines/quality/pipeline.py
  - Telecom-Data-Automation-Platform/quality/great_expectations/__init__.py
  - Telecom-Data-Automation-Platform/transform/dbt/models/
  - Telecom-Data-Automation-Platform/infra/modules/core/keyvault/main.tf
  - Telecom-Data-Automation-Platform/infra/modules/fabric/workspace/main.tf
  - Telecom-Data-Automation-Platform/infra/environments/dev/main.tf
  - Telecom-Data-Automation-Platform/docker-compose.yml
  - Telecom-Data-Automation-Platform/.github/workflows/promote.yml
  - Telecom-Data-Automation-Platform/tests/
---

Evidence: Portfolio, synthetic data. Every record in this project comes from seeded Python generators. Nothing has been deployed to Azure or Microsoft Fabric: there is no Terraform state, no configured backend, and no Git remote for the CI workflows to run on. The parts that have actually run are the data generators and the ML modules, through a local pytest suite. This write-up covers the design, the parts I can show running, and what still has to happen before the lakehouse layers run.

## The problem

A telecom operator has several teams asking the same raw data different questions. Retention wants churn risk per subscriber. Revenue assurance wants to know whether what was billed matches what the network recorded. Network operations wants tower health, and finance wants ARPU trends. If each team builds its own copy of CDRs and billing, the numbers drift apart and nobody trusts the monthly report.

The design I wanted: one shared bronze/silver/gold lakehouse, a small set of conformed core tables, and thin domain marts on top, for eight domains (retention, revenue assurance, network ops, marketing, customer care, finance, roaming, product). I also wanted to develop it on a laptop and have a clear path to Azure, without paying for cloud capacity while the logic was still changing.

## Architecture

```text
 synthetic generators (seeded numpy)          docker-compose (emulators)
 CDR | network KPI | billing | roaming         Azurite | MinIO | Redpanda | Postgres
 campaigns | complaints                        (defined, not wired to the code)
        |
        v  parquet files in data/
 +----------------------------------------------------------------+
 | bronze  pipelines/bronze   PySpark + Delta MERGE, dead-letter   |  written,
 | silver  pipelines/silver   SHA-256 masking, dedup, validation   |  not run
 | quality pipelines/quality  GE expectations, schema-drift check  |
 +----------------------------------------------------------------+
        |
        v
 dbt: 10 core models -> 15 mart models in 8 domain folders          not compiled
        |
        v
 ml/: churn, fraud, revenue leakage, network failure, propensity,   runs under
      pricing elasticity, roaming, forecasting + JSON model registry   pytest

 infra/: Terraform modules (Key Vault, VNet, Blob, Event Hubs, ADF,
         Databricks, Fabric) x 4 environments                        never applied
```

The generators are the most complete part. The CDR generator builds a customer and tower pool around a fixed metro centre, applies peak-hour and duration distributions, and can inject fraud patterns. The network KPI generator emits per-tower readings (RSRP, SINR, dropped-call rate, congestion, latency, throughput) at a configurable interval and degrades 5% of towers on purpose so the failure model has something to find. The sample files saved in `data/` hold 1,000 CDRs (17 columns), 500 billing rows (14 columns) and 4,320,000 network KPI rows (13 columns).

## Decision 1: hash identifiers at the source, mask again in silver

Subscriber IDs are hashed the moment they are generated, so no raw ID ever reaches a CDR file:

```python
def _hash_pii(self, value: str) -> str:
    """Hash PII for privacy"""
    return hashlib.sha256(value.encode()).hexdigest()[:16]
```

The silver pipeline then has a second, configurable step: any column listed in `pii_columns` is replaced with `F.sha2(col, 256)` in Spark before the table is written.

The trade-off is joinability against reversibility. A deterministic hash keeps `caller_id` joinable across CDR, billing and roaming tables, which the domain marts need. It is not anonymisation: an unsalted hash of a predictable ID like `CUST_000123` can be reversed by hashing every candidate. In a real system I would use a keyed hash (HMAC with the key in Key Vault) so only the platform can produce the mapping.

One gap is visible in the sample billing file. It carries both `customer_id` and `hashed_id`, so the raw ID survives at bronze for billing. The silver masking step would cover it if `customer_id` were listed in `pii_columns`, but that pipeline has not run.

## Decision 2: one Terraform tree, gated by a single flag

ADR-001 picks a single Terraform configuration for both local and cloud, with every Azure resource gated on `use_local_dev`:

```hcl
resource "azurerm_key_vault" "main" {
  count                      = var.use_local_dev ? 0 : 1
  name                       = var.name
  soft_delete_retention_days = 90
  purge_protection_enabled   = true
  enable_rbac_authorization  = true
  ...
}
```

With the flag on (the default in `dev`), the plan creates nothing in Azure and you are expected to use the Docker Compose stack instead: Azurite for Blob, MinIO for object storage, Redpanda for Event Hubs/Kafka, Postgres as a source system. With the flag off, the same modules would create Key Vault with RBAC and purge protection, storage, Event Hubs, Data Factory, Databricks and a Fabric capacity and workspace, with remote state in an `azurerm` backend.

The appeal is one set of names and tags for every environment. The cost is that the local path is mostly "skip everything", so it does not test the cloud path at all. That cost shows up in the code. The Key Vault module references resources that are not declared anywhere (`azurerm_namespace.authorization`, `random_password.databricks_token`), and the Fabric module uses `azurerm_fabric_workspace` and `azurerm_fabric_lakehouse`, which the pinned azurerm 3.x provider does not define. ADR-002 itself says Fabric workspaces and lakehouses belong to the Fabric CLI, not Terraform. A `terraform validate` with the flag off would surface all of this. In this repository, "Fabric/Azure parity" means a set of Azure-shaped Terraform modules and a matching emulator stack. It has not been deployed.

## Decision 3: quality checks as data, drift as a deploy blocker

I wrote the quality rules as plain expectation definitions per table type, not inline code. The CDR set requires a non-null, unique `call_sid`, a 16-character hex `caller_id` (matching the hash above), `duration_seconds` between 0 and 86,400, and a non-null `start_time`. Network KPIs get physical ranges (RSRP -140 to -50 dBm, SINR -20 to 30 dB, percentages 0 to 100). Billing gets charge ranges and a `payment_status` value set.

Schema drift is a separate check that compares a batch against a baseline and marks the change as blocking:

```python
added = current_cols - baseline_cols
if added:
    drift_info["drift_detected"] = True
    drift_info["added_columns"] = list(added)
    drift_info["block_deploy"] = True  # Block deployment on new columns
```

Removed columns and dtype changes also set `block_deploy`. The trade-off is strictness. Blocking on an added column is conservative, since an additive change is usually safe with Delta's `mergeSchema`, but for revenue tables I would rather a human look first.

This layer is still a design. The validator calls methods that are not part of the Great Expectations API (`open_expectation_suite`, `add_dataset`), and `create_expectation_suite` refers to an undefined variable. Because `validate()` catches every exception, a run would report "failed" rather than crash. Nothing calls `detect_schema_drift`, and "alerts" in this codebase are `print` statements and in-memory lists. The bronze pipeline's own schema-evolution step has a bug too: when it finds new columns, it overwrites them with nulls instead of keeping them.

## Results

What I can show running:

| Item | Recorded evidence |
|---|---|
| Synthetic sample data | `data/`: 1,000 CDRs, 500 billing rows, 4,320,000 network KPI rows |
| Test suite | pytest cache from 4 Sep 2026: 80 collected tests (41 ML model, 16 end-to-end, 9 ML integration, 8 repo-structure, 6 generator), no failures recorded |
| dbt | 25 model files; 8 mart folders, one per domain |
| Terraform | 10 modules, 4 environments; providers downloaded by `terraform init`, no state file |
| CI workflows | 4 files; no Git remote, so they have never run |

The tests exercise the generators, the ML modules, the JSON model registry, the metrics and alert classes, and the quality-gate manager. They do not touch the PySpark pipelines, Great Expectations, dbt or Terraform, and PySpark and Great Expectations are optional extras that are not installed by default. The ML registry file only holds entries the tests wrote, with fixed fixture metrics, so I don't quote model scores from it.

!!! note "Revenue assurance today"
    Revenue assurance exists in two forms. A Python `RevenueLeakageDetector` checks CDR gaps, duplicate CDRs, rating issues, discount abuse and partner settlement mismatches, and is covered by unit tests. The dbt marts `f_revenue_leakage` and `f_fraud_detection` describe the same reconciliation in SQL but have not compiled.

## What I'd do next

1. **Make dbt compile.** Add a `sources.yml` for the bronze tables, write the six missing staging models (`stg_billing_monthly`, `stg_billing_history`, `stg_campaigns`, `stg_campaign_responses`, `stg_roaming_settlements`, `dim_roaming_partners`), and move the date logic off MySQL-style `DATE_FORMAT`/`INTERVAL` to one engine. DuckDB is the obvious choice for local runs. Then add `schema.yml` tests, since there are none today.
2. **Run Great Expectations for real.** Rewrite the validator against the current GE API, run the CDR, KPI and billing suites on the sample files, and save the validation results as artifacts.
3. **Run bronze and silver once.** Either install the Spark extra or port the pipelines to the `deltalake` Python package, fix the schema-evolution null bug, and confirm that MERGE is idempotent by loading the same batch twice.
4. **Validate the Terraform.** Run `terraform validate` with `use_local_dev=false`, fix the undeclared references, upgrade to azurerm 4.x for `azurerm_fabric_capacity`, and leave workspaces and lakehouses to the Fabric CLI or the Fabric provider, as ADR-002 says.
5. **Build the promotion flow.** `promote.yml` applies Terraform to staging and prod, but it has no rollback step, the prod job checks an issue label that a push event never carries, and it references `tfvars` files and integration tests that do not exist. A real version needs those files, a `terraform plan` artifact reviewed before apply, and a rollback path. ADR-005 calls for one; the workflow does not have it yet.
6. **Add model tracking.** There is no MLflow code yet; the registry is a JSON file. Adding MLflow tracking, and retraining driven by a measured drift metric, would come after the data layers run.

## Links

- Case study: [Telecom lakehouse](../projects/telecom-platform.html)
