# Petroleum Platform Architecture

## Overview

The Petroleum Platform is a comprehensive data engineering solution for oil & gas well monitoring combined with market intelligence. It ingests historical and real-time sensor data, correlates it with live market data, detects anomalies, and provides actionable insights through dashboards and searchable logs.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PETROLEUM PLATFORM ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  VOLVE DATA  │    │   SCRAPERS   │    │ REPLAY SIMULATOR │
│  (Historical)│    │  (EIA, Baker │    │  (SCADA Telemetry│
│              │    │   Hughes)    │    │   Simulation)    │
└──────┬───────┘    └──────┬───────┘    └────────┬─────────┘
       │                   │                      │
       └───────────────────┼──────────────────────┘
                           ▼
              ┌────────────────────────┐
              │      RABBITMQ          │
              │   (Message Broker)     │
              │  ┌──────────────────┐  │
              │  │ Exchanges:       │  │
              │  │ petroleum.sensors│  │
              │  │ petroleum.market │  │
              │  │ petroleum.dlq    │  │
              │  └──────────────────┘  │
              └───────────┬────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌───────────────┐ ┌──────────────────┐
│     NIFI        │ │ELASTICSEARCH  │ │ BIGQUERY / MINIO │
│  (Ingestion/    │ │  (Search/     │ │  (Warehouse/     │
│   Routing/      │ │   Logs)       │ │   Data Lake)     │
│   Validation)   │ │               │ │                  │
└────────┬────────┘ └───────────────┘ └────────┬─────────┘
         │                                     │
         ▼                                     ▼
┌─────────────────┐                   ┌──────────────────┐
│  APACHE BEAM    │                   │  DATABRICKS/     │
│  (Flink Runner) │                   │  PYSPARK BATCH   │
│                 │                   │                  │
│ - Anomaly       │                   │ - Feature Eng.   │
│   Detection     │                   │ - ML Models      │
│ - Enrichment    │                   │ - Aggregations   │
│ - Aggregation   │                   │ - Training       │
└────────┬────────┘                   └────────┬─────────┘
         │                                     │
         └─────────────────┬───────────────────┘
                           ▼
              ┌────────────────────────┐
              │   GRAFANA DASHBOARDS   │
              │   + PROMETHEUS METRICS │
              └────────────────────────┘
```

## Component Details

### 1. Data Ingestion Layer

#### NiFi Cluster (3 nodes)
- **Purpose**: Enterprise-grade data ingestion, routing, transformation
- **Why NiFi**: Visual flow design, built-in processors, data provenance, backpressure handling, cluster mode
- **Flows**:
  - Sensor data validation & enrichment
  - Market data normalization
  - Routing to Elasticsearch (search/logs) and BigQuery/MinIO (analytics)
  - Dead letter queue handling

#### RabbitMQ
- **Purpose**: Reliable message broker between producers and consumers
- **Why RabbitMQ**: Mature, supports multiple exchange types, dead letter exchanges, management UI
- **Exchanges**: `petroleum.sensors` (topic), `petroleum.market` (topic), `petroleum.dlq` (direct)
- **Queues**: Raw, validated, anomalies for sensors; raw/validated for market

### 2. Data Storage Layer

#### Elasticsearch + Kibana
- **Purpose**: Full-text search, log aggregation, ad-hoc analysis
- **Indices**:
  - `well-sensor-YYYY.MM.DD` - Sensor readings with metadata
  - `market-data-YYYY.MM.DD` - Price and rig count data
  - `drilling-reports-YYYY.MM.DD` - Drilling report documents
- **Why Elasticsearch**: Excellent for log search, geo-spatial queries, time-series with ILM

#### BigQuery Emulator (Local) / BigQuery (Production)
- **Purpose**: Analytical data warehouse for structured queries
- **Why BigQuery**: Serverless, SQL interface, partitions/clustering, ML integration
- **Schema**: Partitioned by date, clustered by well_id
- **Local Dev**: goccy/bigquery-emulator for cost-free development

#### MinIO
- **Purpose**: S3-compatible object storage for Parquet/Iceberg/Delta files
- **Why MinIO**: Local S3 API compatible, supports Iceberg/Delta Lake
- **Use Cases**: Data lake storage, ML model artifacts, checkpoint storage

### 3. Stream Processing Layer

#### Apache Beam on Flink
- **Purpose**: Real-time anomaly detection on sensor streams
- **Why Beam/Flink**: Unified batch/stream, exactly-once, event-time processing, windowing
- **Pipeline**:
  1. Read from RabbitMQ (sensor.validated)
  2. Key by well_id + sensor_type
  3. Apply tumbling/sliding windows
  4. Statistical anomaly detection (z-score, IQR)
  5. ML inference (Isolation Forest - future)
  6. Write anomalies to RabbitMQ (anomalies) and Elasticsearch

### 4. Batch Processing Layer

#### Databricks / PySpark
- **Purpose**: Feature engineering, ML model training, large aggregations
- **Why Databricks/PySpark**: Distributed computing, MLflow integration, Delta Lake
- **Jobs**:
  - Daily feature engineering from sensor + production data
  - Weekly ML model retraining (Isolation Forest)
  - Monthly correlation analysis (production vs price)
  - Data quality reports

### 5. Monitoring & Visualization

#### Prometheus + Grafana
- **Purpose**: Infrastructure + business metrics
- **Dashboards**:
  - Pipeline Overview (throughput, latency, errors)
  - Business Metrics (anomalies, prices, production, correlations)
  - Infrastructure (CPU, memory, disk, network)

#### ELK Stack (Elasticsearch + Kibana + Filebeat)
- **Purpose**: Centralized logging
- **Log Sources**: All containers via Filebeat sidecars

### 6. Infrastructure & Deployment

#### Terraform
- **Purpose**: Infrastructure as Code for cloud resources
- **Modules**: BigQuery, GKE/EKS, Cloud Run, Networking, IAM
- **Environments**: dev, staging, prod

#### Ansible
- **Purpose**: Configuration management for VMs/services not in K8s
- **Playbooks**: NiFi, Flink, Monitoring setup

#### Kubernetes (k3s/kind locally)
- **Purpose**: Container orchestration
- **Structure**: Base + Overlays (kustomize)
- **Components**: NiFi, Flink, RabbitMQ, Elasticsearch, Prometheus, Grafana

#### Jenkins
- **Purpose**: CI/CD pipelines
- **Pipelines**: Scraper tests, Beam pipeline tests, Docker builds, Terraform plan/apply

## Data Flow

### Sensor Data Flow
```
Volve CSV/Parquet
      │
      ▼
Replay Simulator (Python)
      │  (configurable rate: 1x, 10x, 60x real-time)
      ▼
RabbitMQ: petroleum.sensors (topic) → well.sensor.raw
      │
      ▼
NiFi: ConsumeKafka → ValidateJson → EnrichWithReferenceData
      │                                    │
      │              ┌─────────────────────┴─────────────────────┐
      ▼              ▼                                           ▼
RabbitMQ:      Elasticsearch                              BigQuery/MinIO
well.sensor.   well-sensor-YYYY.MM.DD                       well_sensor/
validated                           (search, logs)          (analytics, ML)
      │
      ▼
Flink/Beam: Read → Window → Detect Anomalies → Write
      │                                    │
      │              ┌─────────────────────┴─────────────────────┐
      ▼              ▼                                           ▼
RabbitMQ:      Elasticsearch                              BigQuery/MinIO
well.sensor.   well-anomalies-YYYY.MM.DD                    anomalies/
anomalies                                           (analytics)
      │
      ▼
Grafana Dashboard (via Prometheus metrics)
```

### Market Data Flow
```
EIA API / Baker Hughes Scraper (Python)
      │
      ▼
RabbitMQ: petroleum.market (topic) → market.price.raw / market.rigcount.raw
      │
      ▼
NiFi: ConsumeKafka → Validate → Enrich → Convert
      │
      ├─→ Elasticsearch: market-data-YYYY.MM.DD
      └─→ BigQuery/MinIO: market_prices/ / rig_counts/
      │
      ▼
Flink/Beam: Correlation with production data
      │
      ▼
Grafana Dashboard
```

## Technology Choices & Rationale

| Layer | Technology | Alternative Considered | Reason |
|-------|------------|------------------------|--------|
| Ingestion | NiFi | Kafka Connect, Airflow | Visual flows, provenance, clustering |
| Messaging | RabbitMQ | Kafka, Pulsar | Simpler ops, DLX, management UI |
| Search/Logs | Elasticsearch | OpenSearch, Loki | Mature, Kibana, SQL support |
| Warehouse | BigQuery | Snowflake, Redshift | Serverless, ML, local emulator |
| Data Lake | MinIO + Iceberg | Delta Lake, Hudi | S3-compatible, open table format |
| Streaming | Beam/Flink | Spark Streaming, Kafka Streams | Unified API, event-time, exactly-once |
| Batch ML | Databricks/PySpark | SageMaker, Vertex AI | MLflow, Delta Lake, collaborative |
| Monitoring | Prometheus/Grafana | Datadog, CloudWatch | Open source, full control |
| Logging | ELK/EFK | Loki, Splunk | Full-text search, mature |
| CI/CD | Jenkins | GitHub Actions, GitLab CI | Complex pipelines, Docker agents |
| IaC | Terraform | Pulumi, CloudFormation | Multi-cloud, mature providers |
| Config Mgmt | Ansible | Chef, Puppet | Agentless, simple YAML |
| Orchestration | K8s (k3s/kind) | Nomad, ECS | Industry standard, rich ecosystem |

## Security Considerations

### Local Development
- Single-user NiFi auth
- Elasticsearch basic auth (no SSL)
- Default passwords in `.env.example` (must change for prod)

### Production Hardening (Future)
- NiFi: LDAP/OIDC, TLS mutual auth
- RabbitMQ: TLS, separate vhosts per environment
- Elasticsearch: TLS, RBAC, audit logging
- BigQuery: IAM roles, VPC Service Controls
- K8s: Network policies, PodSecurityPolicies, Secrets management
- Vault for secret management

## Scalability Considerations

### Horizontal Scaling
- NiFi: Add nodes to cluster (max ~10)
- RabbitMQ: Quorum queues, federation
- Elasticsearch: Add data nodes, ILM
- Flink: Add TaskManagers, increase slots
- BigQuery: Automatic scaling

### Data Volume Estimates
- **Sensor data**: ~50 wells × 20 sensors × 1 reading/sec = 1M readings/min
- **Market data**: ~10 prices/day + weekly rig count = negligible
- **Historical Volve**: ~3 years × 50 wells × daily = ~55K production records
- **Retention**: 7 years for compliance, tiered storage (hot/warm/cold)

## Failure Handling

### NiFi
- Backpressure on queues
- Data provenance for debugging
- Cluster auto-failover

### RabbitMQ
- Publisher confirms
- Dead letter exchanges
- Queue mirroring (quorum queues)

### Flink
- Checkpointing (exactly-once)
- Savepoints for upgrades
- Restart strategies

### General
- Health checks on all services
- Prometheus alerts for anomalies
- Runbooks for common failures

## Future Enhancements

1. **Real-time ML**: Online learning for anomaly detection
2. **Delta Lake**: ACID transactions on data lake
3. **Trino/Presto**: Federated queries across BigQuery + Elasticsearch
4. **Airflow**: Orchestrate batch jobs (replace Jenkins for batch)
5. **Feature Store**: Centralized feature management (Feast)
6. **Model Registry**: MLflow for model versioning
7. **Data Contracts**: Schema registry (Confluent/Avro)
8. **Multi-region**: Active-active for disaster recovery