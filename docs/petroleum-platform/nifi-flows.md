# NiFi Flow Configuration Guide

This guide details the Apache NiFi flows for the Petroleum Platform, designed to ingest, validate, enrich, and route well sensor and market data.

## Prerequisites

1. NiFi cluster running (3 nodes via Docker Compose)
2. RabbitMQ configured with exchanges and queues
3. Elasticsearch cluster available
4. PostgreSQL database available

## Flow 1: Well Sensor Data Ingestion

### Overview

```
[ConsumeRabbitMQ] -> [Validate JSON] -> [Enrich Attributes]
                                        |
                                        ▼
                              [Route on Attribute]
                              /      |        \
                      [Valid]   [Anomaly]   [Invalid/DLQ]
                         |          |          |
                         ▼          ▼          ▼
                  [Elasticsearch]  [RabbitMQ]  [RabbitMQ DLQ]
                  (well-sensor-*)   (anomalies)  (dead-letter)
                  +
                  [RabbitMQ: validated]
```

### Processor Configuration

#### 1. ConsumeRabbitMQ (Consume Sensor Data)
- **Class**: `org.apache.nifi.amqp.processors.ConsumeAMQP`
- **Queue Name**: `well.sensor.validated`
- **Host**: `rabbitmq`
- **Port**: `5672`
- **Username**: `${rabbitmq.user}`
- **Password**: `${rabbitmq.password}` (from parameter context)
- **Acknowledge Mode**: `MANUAL`
- **Exchange Name**: `petroleum.sensors` (for re-publishing)

#### 2. ValidateJSON
- **Class**: `org.apache.nifi.json.processors.ValidateJson`
- **Schema Text**:
```json
{
  "type": "object",
  "required": ["timestamp", "well_id", "data"],
  "properties": {
    "timestamp": {"type": "string", "format": "date-time"},
    "well_id": {"type": "string"},
    "data": {"type": "object"},
    "simulated": {"type": "boolean"}
  }
}
```

#### 3. EnrichAttributes (UpdateAttribute)
- **Class**: `org.apache.nifi.attributes.processors.UpdateAttribute`
- **Properties**:
  - `well_id`: `${json."data"."WELL_ID":${json.well_id}}`
  - `sensor_type`: `${json."data"."SENSOR_TYPE":${json.sensor_type}}`
  - `timestamp`: `${json."TIMESTAMP":${json.timestamp}}`
  - `elasticsearch.index`: `well-sensor-${now():format("yyyy.MM.dd")}`
  - `filename`: `${uuid}.json`

#### 4. RouteOnAttribute (Route Sensor Data)
- **Class**: `org.apache.nifi.routing.processors.RouteOnAttribute`
- **Properties**:
  - `is_valid`: `${validatejson.status:equals('valid')}`
  - `needs_validation`: `${validatejson.status:equals('invalid')}`
  - `is_anomalous`: `${json."data"."QUALITY":equals('ANOMALY')}` (if present in data)

### Routing Destinations

- **Valid & Normal**: → PutElasticsearchHttp + PublishRabbitMQ (validated)
- **Valid & Anomalous**: → PublishRabbitMQ (anomalies) + PutElasticsearchHttp
- **Invalid**: → PublishRabbitMQ (dead-letter queue)

#### PutElasticsearchHttp (for valid data)
- **Class**: `org.apache.nifi.elasticsearch.processors.PutElasticsearchHttp`
- **Elasticsearch URL**: `http://elasticsearch:9200`
- **Index Name**: `${elasticsearch.index}`
- **Document Type**: `_doc`
- **Identifier**: `${uuid}`

### Controller Services

#### RabbitMQConnectionService
- **Class**: `org.apache.nifi.amqp.impl.RabbitMQConnectionFactory`
- **Host**: `rabbitmq`
- **Port**: `5672`
- **Username**: `${rmq.username}`
- **Password**: `${rmq.password}` (sensitive)

#### ElasticsearchHttpService
- **Class**: `org.apache.nifi.elasticsearch.http.ElasticsearchHttpService`
- **Elasticsearch URL**: `http://elasticsearch:9200`
- **Username**: `elastic`
- **Password**: `${es.password}` (sensitive)

### Parameter Context: PetroleumParameters

| Name | Value | Description |
|------|-------|-------------|
| `rabbitmq.user` | `petroleum` | RabbitMQ username |
| `rabbitmq.password` | `***` | RabbitMQ password (sensitive) |
| `rmq.username` | `petroleum` | RMQ connection service username |
| `rmq.password` | `***` | RMQ connection service password |
| `es.password` | `***` | Elasticsearch password |

## Flow 2: Market Data Ingestion

### Overview

```
[ConsumeRabbitMQ: Price] -> [Validate] -> [Enrich] -> [Publish to ES] + [Publish to RMQ Verified]
[ConsumeRabbitMQ: Rig]  -> [Validate] -> [Enrich] -> [Publish to ES] + [Publish to RMQ Verified]
```

### Processors

#### 1. ConsumeRabbitMQ (Price Data)
- **Queue Name**: `market.price.validated`
- **Routing Key**: `market.price.validated`

#### 2. ConsumeRabbitMQ (Rig Count)
- **Queue Name**: `market.rigcount.validated`
- **Routing Key**: `market.rigcount.validated`

### Routing & Processing

Market data follows a simpler path since it doesn't require anomaly detection:

1. Validate JSON schema
2. Enrich with metadata (source, collection method)
3. Add Elasticsearch index naming attributes
4. Route to Elasticsearch for search

### Elasticsearch Index Mapping

#### well-sensor-* (Sensor Data)
```json
{
  "mappings": {
    "properties": {
      "timestamp": {"type": "date"},
      "well_id": {"type": "keyword"},
      "sensor_type": {"type": "keyword"},
      "value": {"type": "float"},
      "quality_flag": {"type": "keyword"},
      "anomaly_detected": {"type": "boolean"},
      "anomaly_score": {"type": "float"},
      "location": {"type": "geo_point"}
    }
  },
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s",
    "codec": "best_compression"
  }
}
```

#### market-data-* (Market Data)
```json
{
  "mappings": {
    "properties": {
      "timestamp": {"type": "date"},
      "commodity": {"type": "keyword"},
      "price_usd": {"type": "float"},
      "price_date": {"type": "date"},
      "source": {"type": "keyword"}
    }
  },
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1,
    "refresh_interval": "30s"
  }
}
```

## Flow 3: Data Warehouse Output (Batch Path)

For structured analytics, NiFi can also write to BigQuery or MinIO in Parquet format.

### Overview

```
[ConsumeRabbitMQ] -> [ConvertRecord] -> [PartitionRecord] -> [WriteToBigQuery] OR [PutS3Object]
```

### Processors

#### ConvertRecord
- Use AvroReader + ParquetWriter
- Schema derived from sensor data
- Output: Parquet files partitioned by well_id and date

#### PutS3Object (MinIO)
- **Bucket**: `petroleum-well-data`
- **Key Format**: `sensors/{well_id}/{date}.parquet`
- **S3 Endpoint**: `http://minio:9000`

#### PutBigQuery (Alternative)
- **Project ID**: `petroleum-dev`
- **Dataset**: `well_data`
- **Table**: `sensor_readings`
- **Write Disposition**: `WRITE_APPEND`

## Deployment Script

The `deploy-flows.py` script creates the basic flow structure:

```bash
# Make sure NiFi is running and healthy
docker-compose logs nifi-1 | tail -20

# Deploy flows via REST API
python config/nifi/deploy-flows.py \
  --nifi-url http://localhost:8080 \
  --username admin \
  --password changeme123
```

## Manual Setup Steps (if REST API deployment fails)

1. Access NiFi: http://localhost:8080/nifi
2. Create parameter context:
   - Go to "Controller Settings" (gear icon)
   - Create new Parameter Context
   - Add parameters: `rabbitmq.user`, `rabbitmq.password`, `es.password`
   - Assign to process groups
3. Create process groups:
   - Right-click canvas → Create Process Group
   - Name: "PetroleumSensorFlow"
   - Name: "PetroleumMarketFlow"
4. Add controllers and processors as described above
5. Connect processors with appropriate relationships
6. Start processors (right-click → Start)

## Troubleshooting

### Common Issues

1. **RabbitMQ Connection Failed**
   - Check RabbitMQ is running: `docker-compose ps rabbitmq`
   - Verify credentials in parameter context
   - Test connection: `docker-compose exec rabbitmq rabbitmqctl list_queues`

2. **Elasticsearch Connection Failed**
   - Check ES is running: `curl -u elastic:changeme http://localhost:9200`
   - Verify password in parameter context
   - Check ES logs: `docker-compose logs elasticsearch`

3. **JSON Validation Failed**
   - Ensure message has required fields
   - Check routing key matches expected format
   - Review NiFi Bulletin Board for errors

4. **Flow File Backpressure**
   - If queues fill up, check downstream processor status
   - Increase queue size or scale consumers
   - Monitor via NiFi UI metrics

### Performance Tuning

- **Concurrency**: Increase concurrent tasks on ConsumeRabbitMQ (default: 1)
- **Batching**: Use "Max Batch Size" to improve throughput
- **Partitioning**: Separate flows by well_id for parallel processing
- **Backpressure**: Set queue thresholds to prevent memory exhaustion

### Monitoring

Key metrics to monitor in NiFi UI:
- FlowFiles In/Out per processor
- Bytes read/written
- Queue sizes
- JVM heap usage
- Thread pools

These metrics should also be scraped by Prometheus with the NiFi Prometheus endpoint.