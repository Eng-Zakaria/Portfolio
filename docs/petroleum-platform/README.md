# Petroleum Platform

> Oil & Petroleum Well Monitoring + Market Intelligence Platform

A data engineering platform combining historical well-sensor/production data with live oil market data for anomaly detection, production optimization, and market correlation analysis.

## 🏗️ Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Volve Dataset  │     │  Live Scrapers   │     │  Replay Simulator   │
│  (Historical)   │     │  (EIA, Baker     │     │  (SCADA Telemetry)  │
│                 │     │   Hughes)        │     │                     │
└────────┬────────┘     └────────┬─────────┘     └──────────┬──────────┘
         │                       │                        │
         └───────────────────────┼────────────────────────┘
                                 ▼
                    ┌────────────────────────┐
                    │      RabbitMQ          │
                    │   (Message Broker)     │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
    ┌─────────────────┐ ┌───────────────┐ ┌──────────────────┐
    │    NiFi         │ │  Elasticsearch│ │  BigQuery/MinIO  │
    │  (Ingestion/    │ │  (Search/Logs)│ │  (Warehouse/     │
    │   Routing)      │ │               │ │   Data Lake)     │
    └────────┬────────┘ └───────────────┘ └────────┬─────────┘
             │                                     │
             ▼                                     ▼
    ┌─────────────────┐                   ┌──────────────────┐
    │  Apache Beam    │                   │  Databricks/     │
    │  (Flink Runner) │                   │  PySpark Batch   │
    │  - Anomaly      │                   │  - Feature Eng.  │
    │    Detection    │                   │  - ML Models     │
    └────────┬────────┘                   └────────┬─────────┘
             │                                     │
             └─────────────────┬───────────────────┘
                               ▼
                    ┌────────────────────────┐
                    │   Grafana Dashboards   │
                    │   + Prometheus Metrics │
                    └────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Docker Desktop with WSL2 (Windows) / Docker Engine (Linux/macOS)
- 16GB+ RAM recommended (8GB minimum)
- 50GB+ free disk space
- Git

### 1. Clone and Configure

```bash
git clone <this-repo>
cd petroleum-platform

# Copy environment template and customize
cp .env.example .env
# Edit .env with your values (especially API keys)
```

### 2. Start All Services

```bash
# Start the full stack
docker-compose up -d

# Or with custom overrides
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

### 3. Verify Services

| Service | URL | Credentials |
|---------|-----|-------------|
| NiFi (Node 1) | http://localhost:8080 | admin / changeme123 |
| NiFi (Node 2) | http://localhost:8081 | admin / changeme123 |
| NiFi (Node 3) | http://localhost:8082 | admin / changeme123 |
| RabbitMQ Management | http://localhost:15672 | petroleum / changeme |
| Elasticsearch | http://localhost:9200 | elastic / changeme |
| Kibana | http://localhost:5601 | elastic / changeme |
| Flink Dashboard | http://localhost:8081 | - |
| BigQuery Emulator | http://localhost:9050 | - |
| MinIO Console | http://localhost:9001 | minioadmin / changeme |
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3000 | admin / changeme |
| PostgreSQL | localhost:5432 | petroleum / changeme |
| Jenkins | http://localhost:8083 | admin / changeme |

### 4. Run Health Check

```bash
./scripts/health-check.sh
```

## 📁 Repository Structure

```
petroleum-platform/
├── docker-compose.yml          # Main local dev stack
├── docker-compose.override.yml # Local overrides (gitignored)
├── .env.example                # Environment variable template
├── .gitignore
├── README.md
├── docs/
│   ├── architecture.md
│   ├── data-sources.md
│   ├── local-development.md
│   └── deployment.md
├── terraform/                  # Infrastructure as Code
├── ansible/                    # Configuration management
├── kubernetes/                 # K8s manifests (kustomize)
├── jenkins/                    # CI/CD pipelines
├── scripts/                    # Utility scripts
└── config/                     # Service configurations
    ├── nifi/
    ├── rabbitmq/
    ├── elasticsearch/
    ├── flink/
    ├── prometheus/
    ├── grafana/
    ├── postgres/
    └── jenkins/
```

## 🔧 Service Details

### NiFi Cluster (3 Nodes)
- **Purpose**: Data ingestion, validation, enrichment, routing
- **Cluster**: 3 nodes with embedded ZooKeeper
- **Ports**: 8080, 8081, 8082 (UI), 11443-11445 (cluster protocol)
- **Config**: `config/nifi/`

### RabbitMQ
- **Purpose**: Message broker between producers and consumers
- **Ports**: 5672 (AMQP), 15672 (Management)
- **Config**: `config/rabbitmq/definitions.json`

### Elasticsearch + Kibana
- **Purpose**: Searchable index for well logs, drilling reports, scraper output
- **Ports**: 9200/9300 (ES), 5601 (Kibana)
- **Security**: Enabled with basic auth

### Apache Flink
- **Purpose**: Stream processing for real-time anomaly detection
- **Topology**: 1 JobManager + 2 TaskManagers (4 slots each)
- **Ports**: 8081 (JobManager UI)
- **Config**: `config/flink/flink-conf.yaml`

### BigQuery Emulator
- **Purpose**: Local warehouse development
- **Ports**: 9050
- **Project**: `petroleum-dev`, Dataset: `well_data`

### MinIO
- **Purpose**: S3-compatible storage for Parquet/Iceberg/Delta tables
- **Ports**: 9000 (S3 API), 9001 (Console)

### Prometheus + Grafana
- **Purpose**: Metrics collection and visualization
- **Ports**: 9090 (Prometheus), 3000 (Grafana)
- **Config**: `config/prometheus/`, `config/grafana/`

## 📊 Data Sources

### Historical: Equinor Volve Field
- **Source**: https://www.equinor.com/energy/volve-data-sharing
- **Data**: Well logs, production data, drilling reports
- **Format**: LAS, CSV, PDF, WITSML

### Live: EIA Open Data API
- **Source**: https://www.eia.gov/opendata/
- **Data**: WTI/Brent spot prices, inventory, production
- **API Key**: Required (free registration)

### Live: Baker Hughes Rig Count
- **Source**: https://rigcount.bakerhughes.com/
- **Data**: Weekly US/International rig counts
- **Access**: Public, no auth required

## 🛠️ Development Workflow

### Adding a New Service

1. Create service repo (e.g., `petroleum-data-ingestion`)
2. Add Dockerfile and docker-compose snippet
3. Integrate into main docker-compose.yml
4. Add Prometheus metrics endpoint
5. Create Grafana dashboard
6. Add to health-check.sh

### Running Tests

```bash
# Scraper tests
docker-compose exec scraper pytest tests/

# Beam pipeline tests
docker-compose exec flink-jobmanager pytest tests/

# NiFi flow validation
# (Manual via UI or NiFi CLI)
```

## 📚 Documentation

- [Architecture](docs/architecture.md)
- [Data Sources](docs/data-sources.md)
- [Local Development](docs/local-development.md)
- [Deployment](docs/deployment.md)

## 🔐 Security Notes

- All default passwords in `.env.example` are **insecure** - change for production
- NiFi uses single-user auth for local dev; use LDAP/OIDC in production
- Elasticsearch security enabled but SSL disabled locally
- RabbitMQ uses default Erlang cookie - change for production
- Never commit `.env` or secrets to version control

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

Proprietary - Internal Use Only

## 🆘 Troubleshooting

### Services Won't Start
```bash
# Check logs
docker-compose logs -f <service-name>

# Check resources
docker stats

# Reset everything
docker-compose down -v
docker-compose up -d
```

### Port Conflicts
Edit `.env` to change port mappings or stop conflicting services.

### Memory Issues
Reduce JVM heap sizes in `.env`:
```bash
NIFI_JVM_HEAP_MAX=1g
FLINK_JOBMANAGER_MEMORY=1g
FLINK_TASKMANAGER_MEMORY=1g
ES_JAVA_OPTS=-Xms512m -Xmx512m
```

### NiFi Cluster Not Forming
1. Check ZooKeeper is healthy: `docker-compose logs zookeeper`
2. Verify all 3 NiFi nodes can reach ZooKeeper
3. Check `authorizers.xml` and `login-identity-providers.xml` in `config/nifi/`

## 📞 Support

Internal team: #petroleum-platform on Slack