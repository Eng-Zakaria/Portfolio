# Local Development Guide

This guide covers setting up and working with the Petroleum Platform locally using Docker Compose.

## Prerequisites

- **OS**: Windows 10/11 with WSL2, Linux, or macOS
- **Docker**: Docker Desktop (WSL2 backend recommended for Windows) or Docker Engine
- **Memory**: 16GB+ RAM allocated to Docker (8GB minimum)
- **Disk Space**: 50GB+ free space
- **Tools**: Git, make, curl, jq (optional but helpful)

## Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd petroleum-platform
```

### 2. Environment Setup

Copy the environment template and customize:

```bash
cp .env.example .env
```

Edit `.env` with your preferred values. Key variables to consider:

```bash
# Adjust based on your available resources
NIFI_JVM_HEAP_MAX=2g          # NiFi max heap (per node)
FLINK_JOBMANAGER_MEMORY=2g    # Flink JobManager memory
FLINK_TASKMANAGER_MEMORY=2g   # Flink TaskManager memory
ES_JAVA_OPTS="-Xms1g -Xmx1g"  # Elasticsearch heap
```

For API keys:
```bash
# Get free API key from https://www.eia.gov/opendata/register.php
EIA_API_KEY=your_actual_eia_api_key_here
```

### 3. Start the Platform

```bash
# Start all services in background
docker-compose up -d

# Or watch logs in real-time (useful for first startup)
docker-compose up
```

### 4. Verify Services Are Running

Run the health check script:

```bash
./scripts/health-check.sh
```

Or manually check key services:

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| NiFi (Node 1) | http://localhost:8080/nifi | admin / changeme123 |
| NiFi (Node 2) | http://localhost:8081/nifi | admin / changeme123 |
| NiFi (Node 3) | http://localhost:8082/nifi | admin / changeme123 |
| RabbitMQ Management | http://localhost:15672 | petroleum / changeme |
| Elasticsearch | http://localhost:9200 | elastic / changeme |
| Kibana | http://localhost:5601 | elastic / changeme |
| Flink Dashboard | http://localhost:8081 | - |
| BigQuery Emulator | http://localhost:9050 | - |
| MinIO Console | http://localhost:9001 | minioadmin / changeme |
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3000 | admin / changeme |
| PostgreSQL | localhost:5432 | petroleum / changeme |
| Jenkins | http://localhost:8083/login | admin / changeme |

### 5. Access the Platform

- **NiFi UI**: Design and monitor data flows
- **Grafana**: View system and business dashboards
- **Kibana**: Explore logs and indexed data
- **Flink UI**: Monitor stream processing jobs
- **MinIO Console**: Browse object storage
- **Jenkins**: CI/CD pipelines

## Service Details

### NiFi Cluster (3 Nodes)
- **Purpose**: Ingest, validate, route data
- **Access**: Three separate UIs on ports 8080, 8081, 8082
- **Cluster Status**: Viewable via Cluster menu in any NiFi UI
- **Default Flow**: None - you'll create flows for your use case

### RabbitMQ
- **Purpose**: Message broker
- **Management UI**: http://localhost:15672
- **Default Queues**: Pre-created for sensors/market data
- **Monitoring**: Check queue depths and message rates

### Elasticsearch + Kibana
- **Purpose**: Searchable index for logs and structured data
- **Elasticsearch API**: http://localhost:9200
- **Kibana**: http://localhost:5601
- **Index Patterns**: Create these in Kibana:
  - `well-sensor-*` (time field: @timestamp)
  - `market-data-*` (time field: @timestamp)
  - `drilling-reports-*` (time field: @timestamp)

### Apache Flink
- **Purpose**: Real-time stream processing
- **JobManager UI**: http://localhost:8081
- **TaskManager Metrics**: Ports 9250, 9260
- **Checkpoints**: Stored in Docker volumes
- **Savepoints**: For manual checkpointing

### BigQuery Emulator
- **Purpose**: Local data warehouse development
- **API Endpoint**: http://localhost:9050
- **Project**: `petroleum-dev`
- **Dataset**: `well_data`
- **Compatible Libraries**: Google Cloud BigQuery client libraries
- **Web UI**: Not available (emulator only)

### MinIO
- **Purpose**: S3-compatible object storage
- **Console**: http://localhost:9001
- **S3 API Endpoint**: http://localhost:9000
- **Default Buckets**: None - create as needed
- **Use Cases**: Parquet/Iceberg storage, ML models, backups

### Prometheus + Grafana
- **Purpose**: Metrics collection and visualization
- **Prometheus**: http://localhost:9090
  - Targets: All services expose `/metrics` endpoints
  - Rules: Configured in `config/prometheus/rules/`
- **Grafana**: http://localhost:3000
  - Default Dashboards: Pipeline Overview, Business Metrics
  - Data Sources: Prometheus, Elasticsearch, PostgreSQL, BigQuery Emulator
  - Alerting: Configured via Prometheus Alertmanager (future)

### PostgreSQL
- **Purpose**: Relational database for NiFi metadata and app data
- **Host**: localhost:5432
- **Database**: `petroleum`
- **Schemas**: `public`, `nifi`, `petroleum`, `airflow`
- **Initialized Tables**: Wells, sensors, readings, anomalies, market data, rig counts

### Jenkins
- **Purpose**: CI/CD automation
- **URL**: http://localhost:8083
- **Configuration**: Managed via JCasC (`config/jenkins/casc/jenkins.yml`)
- **Credentials**: Pre-loaded for EIA API, Docker Hub, Git, Slack
- **Agent Templates**: Maven, Python, Flink Docker agents

## Development Workflow

### 1. Creating a New Scraper

```bash
# Example: Add a new market data scraper
mkdir -p ../petroleum-data-ingestion/scrapers/new-source
cd ../petroleum-data-ingestion/scrapers/new-source

# Create Python virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install requests beautifulsoup4 lxml pandas prometheus-client

# Create scraper.py with:
# - Proper User-Agent identifying the project
# - Rate limiting (respect robots.txt)
# - Error handling and retries
# - Metrics endpoint (/metrics) for Prometheus
# - Publishing to RabbitMQ exchange

# Build Docker image
docker build -t petroleum-scraper-new-source:latest .

# Update docker-compose.yml to add the service
# Add to docker-compose.override.yml to avoid conflicts with base file
```

### 2. Developing NiFi Flows

1. Access NiFi UI at http://localhost:8080
2. Use drag-and-drop to create flows
3. Standard processors available:
   - ConsumeMQTT/PublishMQTT (for MQTT)
   - ConsumeKafkaRecord/PublishKafkaRecord (for Kafka)
   - GetHTTP/PostHTTP (for HTTP endpoints)
   - ExecuteScript (for Python/Jython/Groovy)
   - PutDatabaseRecord (for JDBC)
   - PutElasticsearchHttpRecord
   - PutFile/PutHDFS (for file output)
4. Controller Services to configure:
   - DBCPConnectionPool (for PostgreSQL)
   - ElasticsearchHttpService
   - KafkaConnect (for Kafka producers/consumers)
5. Use Parameters context for environment-specific values
6. Export flow as template for sharing/version control

### 3. Developing Beam/Flink Pipelines

```bash
# Example: Create anomaly detection pipeline
mkdir -p ../petroleum-stream-processing/src/main/python
cd ../petroleum-stream-processing/src/main/python

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install Apache Beam with Flink runner
pip install "apache-beam[gcp]"==2.50.0

# Develop your pipeline using Beam SDK for Python
# Test locally with DirectRunner first
# Then test with Flink cluster using FlinkRunner

# Build Docker image for Flink job submission
# Update docker-compose to mount your code or build custom image
```

### 4. Testing Changes

```bash
# Run health check after changes
./scripts/health-check.sh

# Check specific service logs
docker-compose logs -f nifi-1
docker-compose logs -f rabbitmq
docker-compose logs -f flink-jobmanager

# View metrics in Prometheus
# http://localhost:9090/graph?g0.expr=up&g0.tab=1

# View traces in Grafana
# http://localhost:3000 (import JSON dashboards from config/grafana/dashboards/)
```

## Common Operations

### Stopping Services

```bash
# Stop but preserve volumes (data remains)
docker-compose down

# Stop and remove volumes (data lost!)
docker-compose down -v

# Stop specific services
docker-compose stop nifi-1 nifi-2 nifi-3 rabbitmq
```

### Viewing Logs

```bash
# Follow logs for a service
docker-compose logs -f nifi-1

# Follow logs for all services
docker-compose logs -f

# Show last 100 lines
docker-compose logs --tail=100 elasticsearch

# Show logs since timestamp
docker-compose logs --since 1h
```

### Managing Volumes (Data Persistence)

```bash
# List all volumes
docker volume ls | grep petroleum

# Inspect a volume
docker volume inspect petroleum-nifi1_data

# Backup a volume (example for NiFi configs)
docker run --rm \
  -v petroleum-nifi1_data:/volume \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/nifi1-data.tar.gz /volume

# Restore a volume
docker run --rm \
  -v petroleum-nifi1_data:/volume \
  -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/nifi1-data.tar.gz -C /volume
```

### Updating Images

```bash
# Pull latest images for services
docker-compose pull

# Recreate containers with new images
docker-compose up -d

# Or do both in one command
docker-compose up -d --pull
```

### Resource Management

If you encounter memory issues:

1. Reduce JVM heap sizes in `.env`:
   ```bash
   NIFI_JVM_HEAP_MAX=1g
   FLINK_JOBMANAGER_MEMORY=1g
   FLINK_TASKMANAGER_MEMORY=1g
   ES_JAVA_OPTS="-Xms512m -Xmx512m"
   ```

2. Reduce Flink TaskManager slots:
   ```bash
   FLINK_TASKMANAGER_SLOTS=2
   ```

3. Reduce Elasticsearch shard count (modify `elasticsearch.yml`):
   ```yaml
   index.number_of_shards: 1
   index.number_of_replicas: 0
   ```

4. Restart services:
   ```bash
   docker-compose up -d
   ```

## Troubleshooting

### Services Not Starting

1. **Check Docker resources**:
   ```bash
   docker info  # Look at Memory/Limit
   docker system df  # Show disk usage
   ```

2. **Check container status**:
   ```bash
   docker-compose ps
   docker-compose logs <service-name>
   ```

3. **Common issues**:
   - **Port conflicts**: Check what's using the port with `netstat -ano | findstr :PORT`
   - **Insufficient memory**: Increase Docker memory allocation or reduce service memory
   - **Volume permissions**: On Windows WSL2, ensure proper Linux permissions
   - **Network issues**: Verify all services are on `petroleum-network`

### NiFi Specific Issues

- **Cluster not forming**: Check ZooKeeper logs, ensure all nodes can reach ZK
- **Flow not running**: Check NiFi bulletin board for errors
- **Backpressure**: Increase queue sizes or consume faster
- **Provenance**: Check provenance events for data lineage

### Flink Specific Issues

- **JobManager not connecting TaskManagers**: Check flink-conf.yaml, ensure hostname resolution
- **Checkpoint failures**: Ensure sufficient storage for checkpoints
- **Memory errors**: Increase TaskManager memory or reduce state size
- **Late data**: Adjust watermark strategy or allowed lateness

### Elasticsearch Specific Issues

- **Red cluster status**: Check for unallocated shards, disk space
- **Slow queries**: Review mapping, use appropriate aggregations
- **Memory issues**: Adjust heap size, check fielddata usage
- **Snapshot/restore**: Configure snapshot repository for backups

### Getting Help

- **Container logs**: First place to check - `docker-compose logs <service>`
- **Health endpoint**: Most services expose `/health` or similar
- **Metrics**: Prometheus endpoint shows internal metrics
- **Documentation**: Each service has extensive official documentation
- **Community**: Search for "[service-name] docker-compose" for common patterns

## Moving to Kubernetes

Once everything works locally with Docker Compose:

1. Review the Kubernetes manifests in `kubernetes/`
2. Customize `kubernetes/overlays/local/` for your local k3s/kind cluster
3. Apply manifests:
   ```bash
   kubectl apply -k kubernetes/overlays/local/
   ```
4. Use `kubectl port-forward` to access UIs locally
5. Monitor with `kubectl get pods -n petroleum-platform`

## Backup and Restore

### Regular Backups

```bash
# Backup script example
#!/bin/bash
BACKUP_DIR=/mnt/c/Users/devza/Work/Workspace/petroleum-platform/backups
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR/$TIMESTAMP"

# Backup volumes
docker run --rm -v petroleum-nifi1_data:/volume -v "$BACKUP_DIR/$TIMESTAMP":/backup alpine tar czf /backup/nifi1-data.tar.gz /volume
docker run --rm -v petroleum-postgres_data:/volume -v "$BACKUP_DIR/$TIMESTAMP":/backup alpine tar czf /backup/postgres-data.tar.gz /volume
docker run --rm -v petroleum-minio_data:/volume -v "$BACKUP_DIR/$TIMESTAMP":/backup alpine tar czf /backup/minio-data.tar.gz /volume

# Backup config files
cp -r config "$BACKUP_DIR/$TIMESTAMP/"
cp docker-compose.yml .env.example "$BACKUP_DIR/$TIMESTAMP/"
```

### Disaster Recovery

1. Stop all containers: `docker-compose down`
2. Restore volumes from backup
3. Restore config files
4. Restart: `docker-compose up -d`

## Performance Tuning

### NiFi
- Increase concurrent tasks on processors
- Use appropriate flowfile prioritization
- Enable/provide adequate provenance repository
- Consider disabling site-to-site if not needed

### RabbitMQ
- Use lazy queues for long-term storage
- Monitor memory and disk alarms
- Consider queue mirroring for HA
- Tune kernel parameters for high connection counts

### Elasticsearch
- Use ILM (Index Lifecycle Management) policies
- Optimize mappings for your data types
- Enable compression where appropriate
- Consider hot/warm/cold architecture

### Flink
- Tune checkpoint interval based on throughput
- Use RocksDB state backend for large state
- Enable incremental checkpoints
- Adjust time characteristics and watermark strategy

### General
- Monitor with Prometheus/Grafana
- Set up alerts for resource exhaustion
- Regularly review and adjust resource limits
- Consider horizontal scaling before vertical scaling

---

## Next Steps After Local Setup

1. **Download and explore Volve dataset** (see `scripts/download-volve.sh`)
2. **Create initial NiFi flows** for ingesting Volve data
3. **Build the replay simulator** to publish historical data to RabbitMQ
4. **Create the EIA and Baker Hughes scrapers**
5. **Configure NiFi to route data to Elasticsearch and BigQuery**
6. **Develop the Beam pipeline for basic anomaly detection**
7. **Set up Grafana dashboards for monitoring**
8. **Move to Kubernetes** when ready for production-like environment

Remember: Always respect data sources' terms of service and rate limits when developing scrapers and ingestion pipelines.