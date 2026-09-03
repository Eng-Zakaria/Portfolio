# Deployment Guide

## Overview

This guide covers deployment options for the Blockchain GDPR Transaction Data Aggregator, including Docker, Kubernetes, and traditional server deployment.

## Prerequisites

- Docker & Docker Compose (for containerized deployment)
- Python 3.8+ (for direct deployment)
- PostgreSQL 13+
- Redis 6+
- Elasticsearch 8+
- Node.js 16+ (for monitoring dashboards)

## Environment Configuration

### 1. Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/blockchain_analytics
REDIS_URL=redis://localhost:6379/0
ELASTICSEARCH_URL=http://localhost:9200
MONGODB_URL=mongodb://localhost:27017/blockchain_data

# Blockchain APIs
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
BITCOIN_RPC_URL=http://localhost:8332
BITCOIN_RPC_USER=your_rpc_user
BITCOIN_RPC_PASSWORD=your_rpc_password

# Market Data APIs
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
COINGECKO_API_KEY=your_coingecko_key
BINANCE_API_KEY=your_binance_key
BINANCE_SECRET_KEY=your_binance_secret

# Security
SECRET_KEY=your_super_secret_key_here_change_in_production
ENCRYPTION_KEY=your_32_byte_encryption_key_here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=30

# Compliance
GDPR_ENABLED=true
PCI_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=2555
DATA_RETENTION_DAYS=365

# Monitoring
SENTRY_DSN=your_sentry_dsn
PROMETHEUS_PORT=9090
LOG_LEVEL=INFO
```

### 2. Security Considerations

- Use strong, unique secrets
- Enable HTTPS in production
- Configure firewall rules
- Set up proper access controls
- Enable audit logging

## Docker Deployment

### Quick Start

1. **Clone and Setup**
```bash
git clone https://github.com/example/blockchain-gdpr-transaction-data-aggregator.git
cd blockchain-gdpr-transaction-data-aggregator
cp .env.example .env
# Edit .env with your configuration
```

2. **Start Services**
```bash
docker-compose up -d
```

3. **Initialize Database**
```bash
docker-compose exec api python scripts/init_db.py
```

4. **Verify Deployment**
```bash
curl http://localhost:8000/health
```

### Docker Compose Services

- **postgres**: PostgreSQL database
- **redis**: Redis cache and message broker
- **elasticsearch**: Search and analytics
- **mongodb**: Document storage
- **api**: Main application API
- **celery_worker**: Background task processing
- **celery_beat**: Scheduled tasks
- **prometheus**: Metrics collection
- **grafana**: Metrics visualization
- **nginx**: Reverse proxy

### Production Docker Configuration

For production, create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  api:
    image: your-registry/blockchain-gdpr-transaction-data-aggregator:latest
    environment:
      - LOG_LEVEL=WARNING
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./config/nginx/nginx.prod.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
```

## Kubernetes Deployment

### 1. Namespace and ConfigMaps

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: blockchain-aggregator

---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: blockchain-aggregator
data:
  DATABASE_URL: "postgresql://postgres:password@postgres:5432/blockchain_analytics"
  REDIS_URL: "redis://redis:6379/0"
  LOG_LEVEL: "INFO"
```

### 2. Secrets

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: blockchain-aggregator
type: Opaque
data:
  SECRET_KEY: <base64-encoded-secret>
  ENCRYPTION_KEY: <base64-encoded-encryption-key>
  ETHEREUM_RPC_URL: <base64-encoded-rpc-url>
```

### 3. Database Deployment

```yaml
# postgres.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: blockchain-aggregator
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        env:
        - name: POSTGRES_DB
          value: blockchain_analytics
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: POSTGRES_PASSWORD
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi
```

### 4. Application Deployment

```yaml
# api.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: blockchain-aggregator
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: your-registry/blockchain-gdpr-transaction-data-aggregator:latest
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: blockchain-aggregator
spec:
  selector:
    app: api
  ports:
  - port: 80
    targetPort: 8000
  type: ClusterIP

---
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: blockchain-aggregator
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: api-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 80
```

### 5. Deploy to Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/api.yaml

# Wait for pods to be ready
kubectl get pods -n blockchain-aggregator

# Check logs
kubectl logs -f deployment/api -n blockchain-aggregator
```

## Traditional Server Deployment

### 1. System Requirements

- **CPU**: 4+ cores
- **Memory**: 8GB+ RAM
- **Storage**: 100GB+ SSD
- **OS**: Ubuntu 20.04+ / CentOS 8+ / RHEL 8+

### 2. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and build tools
sudo apt install python3.8 python3.8-venv python3.8-dev build-essential -y

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Redis
sudo apt install redis-server -y

# Install Elasticsearch (optional)
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-amd64.deb
sudo dpkg -i elasticsearch-8.11.0-amd64.deb
sudo systemctl enable elasticsearch
sudo systemctl start elasticsearch
```

### 3. Database Setup

```bash
# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE blockchain_analytics;
CREATE USER blockchain_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE blockchain_analytics TO blockchain_user;
\q
EOF
```

### 4. Application Setup

```bash
# Create application user
sudo useradd -m -s /bin/bash blockchain

# Clone repository
sudo -u blockchain git clone https://github.com/example/blockchain-gdpr-transaction-data-aggregator.git /opt/blockchain-aggregator
cd /opt/blockchain-gdpr-transaction-data-aggregator

# Setup virtual environment
sudo -u blockchain python3.8 -m venv venv
sudo -u blockchain venv/bin/pip install --upgrade pip
sudo -u blockchain venv/bin/pip install -r requirements.txt

# Copy and configure environment
sudo -u blockchain cp .env.example .env
sudo -u blockchain nano .env  # Edit configuration

# Initialize database
sudo -u blockchain venv/bin/python scripts/init_db.py
```

### 5. Systemd Service

Create `/etc/systemd/system/blockchain-aggregator.service`:

```ini
[Unit]
Description=Blockchain GDPR Transaction Data Aggregator
After=network.target postgresql.service redis.service

[Service]
Type=exec
User=blockchain
Group=blockchain
WorkingDirectory=/opt/blockchain-gdpr-transaction-data-aggregator
Environment=PATH=/opt/blockchain-aggregator/venv/bin
ExecStart=/opt/blockchain-aggregator/venv/bin/python main.py
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable blockchain-aggregator
sudo systemctl start blockchain-aggregator

# Check status
sudo systemctl status blockchain-aggregator
```

### 6. Nginx Configuration

Create `/etc/nginx/sites-available/blockchain-aggregator`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/ssl/certs/api.yourdomain.com.crt;
    ssl_certificate_key /etc/ssl/private/api.yourdomain.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}

# Rate limiting
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/blockchain-aggregator /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring and Logging

### 1. Prometheus Configuration

Create `config/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'blockchain-aggregator'
    static_configs:
      - targets: ['api:9090']
    metrics_path: /metrics
    scrape_interval: 5s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
```

### 2. Grafana Dashboards

Import pre-configured dashboards:
- System Overview
- API Performance
- Database Metrics
- Compliance Monitoring

### 3. Log Aggregation

Configure structured logging with ELK stack:
- Elasticsearch for log storage
- Logstash for log processing
- Kibana for log visualization

## Backup and Recovery

### 1. Database Backup

```bash
# PostgreSQL backup
pg_dump -h localhost -U blockchain_user blockchain_analytics > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backup script
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U blockchain_user blockchain_analytics | gzip > $BACKUP_DIR/blockchain_$DATE.sql.gz

# Keep last 7 days
find $BACKUP_DIR -name "blockchain_*.sql.gz" -mtime +7 -delete
```

### 2. Application Data Backup

```bash
# Backup configuration and logs
tar -czf /opt/backups/app_config_$(date +%Y%m%d_%H%M%S).tar.gz \
    /opt/blockchain-gdpr-transaction-data-aggregator/.env \
    /opt/blockchain-gdpr-transaction-data-aggregator/logs/ \
    /opt/blockchain-gdpr-transaction-data-aggregator/config/
```

### 3. Recovery Procedures

1. **Database Recovery**:
```bash
# Restore from backup
gunzip -c backup_20230222_150000.sql.gz | psql -h localhost -U blockchain_user blockchain_analytics
```

2. **Application Recovery**:
```bash
# Restore configuration
tar -xzf app_config_20230222_150000.tar.gz -C /opt/blockchain-gdpr-transaction-data-aggregator/

# Restart services
sudo systemctl restart blockchain-aggregator
```

## Scaling

### Horizontal Scaling

- Load balance across multiple API instances
- Use read replicas for database queries
- Implement caching layers
- Consider microservices architecture

### Vertical Scaling

- Increase CPU and memory resources
- Optimize database queries
- Use connection pooling
- Implement data partitioning

## Security

### 1. Network Security

- Configure firewall rules
- Use VPN for admin access
- Implement DDoS protection
- Monitor for suspicious activity

### 2. Application Security

- Regular security updates
- Vulnerability scanning
- Penetration testing
- Security headers configuration

### 3. Data Protection

- Encryption at rest and in transit
- Regular security audits
- Compliance monitoring
- Data retention policies

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check connection string
   - Verify database is running
   - Check network connectivity

2. **High Memory Usage**
   - Monitor memory consumption
   - Optimize queries
   - Increase available memory

3. **Slow API Response**
   - Check database performance
   - Monitor system resources
   - Review application logs

### Debug Commands

```bash
# Check service status
sudo systemctl status blockchain-aggregator

# View logs
sudo journalctl -u blockchain-aggregator -f

# Database connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Redis status
redis-cli info

# System resources
htop
iostat
```

## Maintenance

### Regular Tasks

1. **Daily**
   - Monitor system health
   - Check log files
   - Verify backups

2. **Weekly**
   - Update security patches
   - Review performance metrics
   - Clean up old data

3. **Monthly**
   - Security audits
   - Capacity planning
   - Disaster recovery testing

### Automated Maintenance

Create maintenance scripts for:
- Log rotation
- Data cleanup
- Backup verification
- Health checks

## Support

For deployment support:
- Documentation: https://docs.example.com
- Issues: https://github.com/example/blockchain-gdpr-transaction-data-aggregator/issues
- Email: support@example.com
- Slack: #blockchain-aggregator-support
