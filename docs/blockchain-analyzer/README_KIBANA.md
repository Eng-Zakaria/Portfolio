# 📊 Kibana Dashboard Integration

## 🚀 Quick Start

### 1. Start the Stack
```bash
# Start Elasticsearch, Kibana, and Neo4j
docker-compose up -d

# Check services are running
docker-compose ps
```

### 2. Run the Application
```bash
# Configure API keys (optional)
python setup_env.py

# Run with Kibana integration
python main.py
```

### 3. Access Kibana
- **Kibana Dashboard**: http://localhost:5601
- **Elasticsearch**: http://localhost:9200
- **Neo4j Browser**: http://localhost:7474

## 📈 Dashboard Features

### 🎯 **Real-time Blockchain Analytics**

**📊 Transaction Volume**
- Hourly transaction counts
- 24-hour rolling window
- Interactive timeline

**⛽ Gas Price Analysis**
- Average gas price trends
- Price volatility tracking
- Cost optimization insights

**🔍 Suspicious Activity Detection**
- High-value transaction alerts
- Unusual pattern identification
- Risk scoring visualization

**👛 Wallet Activity Heatmap**
- Most active wallets
- Transaction clustering
- Network flow analysis

**📋 Transaction Types**
- Contract vs simple transfers
- Creation vs interaction
- Distribution charts

## 🔧 Technical Architecture

```
Blockchain Data → Spark ETL → Elasticsearch → Kibana Dashboard
                      ↓
                   Neo4j Graph ← Performance Testing
```

### **Data Flow**
1. **Ingestion**: Real blockchain data via Infura
2. **Processing**: Spark ETL pipeline (Bronze → Silver → Gold)
3. **Indexing**: Elasticsearch for search & analytics
4. **Visualization**: Kibana dashboards
5. **Graph Analysis**: Neo4j for relationship queries

## 📊 Dashboard Panels

### 1. **Transaction Volume (Last 24h)**
- **Type**: Histogram
- **X-axis**: Time (hourly buckets)
- **Y-axis**: Transaction count
- **Purpose**: Identify peak activity periods

### 2. **Gas Price Trends**
- **Type**: Line chart
- **X-axis**: Time
- **Y-axis**: Gas price (Gwei)
- **Purpose**: Cost optimization insights

### 3. **High-Value Transactions**
- **Type**: Table
- **Filters**: > 10 ETH transactions
- **Columns**: Hash, From, To, Value
- **Purpose**: Suspicious activity monitoring

### 4. **Most Active Wallets**
- **Type**: Heatmap
- **X-axis**: From addresses
- **Y-axis**: To addresses
- **Purpose**: Identify transaction patterns

### 5. **Transaction Types**
- **Type**: Pie chart
- **Categories**: Simple transfer, Contract interaction, Creation
- **Purpose**: Network usage analysis

## 🔍 Elasticsearch Integration

### **Index Mappings**
```json
{
  "mappings": {
    "properties": {
      "hash": {"type": "keyword"},
      "block_number": {"type": "long"},
      "from_address": {"type": "keyword"},
      "to_address": {"type": "keyword"},
      "value": {"type": "double"},
      "value_eth": {"type": "double"},
      "gas_price": {"type": "double"},
      "block_timestamp": {"type": "date"},
      "tx_type": {"type": "keyword"},
      "risk_score": {"type": "integer"}
    }
  }
}
```

### **Sample Queries**
```json
// High-value transactions
{
  "query": {
    "range": {
      "value_eth": {
        "gte": 10
      }
    }
  }
}

// Contract interactions
{
  "query": {
    "term": {
      "tx_type": "contract_interaction"
    }
  }
}
```

## 🎨 Customization

### **Add New Panels**
1. Edit `src/visualization/kibana_dashboard.py`
2. Add new panel method
3. Include in `build_dashboard()`
4. Re-run application

### **Modify Mappings**
1. Update `generate_elasticsearch_mappings()`
2. Add new fields to document preparation
3. Re-index data

### **Custom Visualizations**
- **Network Graph**: Use Neo4j Bloom
- **Geographic Maps**: Add location data
- **Real-time Alerts**: Configure Watcher

## 📱 Mobile Access

Kibana dashboards are mobile-responsive:
- Access via tablet/phone
- Touch-optimized controls
- Real-time updates

## 🔒 Security Considerations

### **Production Setup**
- Enable Elasticsearch security
- Configure Kibana authentication
- Use HTTPS/TLS
- Set up firewall rules

### **Data Privacy**
- Anonymize wallet addresses
- Implement data retention policies
- Configure access controls

## 🚀 Performance Optimization

### **Elasticsearch**
- Index sharding strategy
- Refresh interval tuning
- Query optimization

### **Kibana**
- Dashboard caching
- Lazy loading
- Sample rate adjustment

## 🐛 Troubleshooting

### **Common Issues**

**Kibana can't connect to Elasticsearch**
```bash
# Check Elasticsearch is running
curl http://localhost:9200/_cluster/health

# Restart services
docker-compose restart
```

**No data in dashboard**
```bash
# Check indexing logs
python main.py 2>&1 | grep -i elasticsearch

# Verify index exists
curl http://localhost:9200/_cat/indices
```

**Slow dashboard loading**
- Reduce time range
- Optimize queries
- Increase resources

## 📚 Advanced Features

### **Machine Learning**
- Anomaly detection
- Forecasting
- Pattern recognition

### **Alerting**
- Email notifications
- Slack integration
- Webhook callbacks

### **Export Options**
- PDF reports
- CSV data export
- API access

## 🎯 Next Steps

1. **Configure real API keys**: `python setup_env.py`
2. **Start the stack**: `docker-compose up -d`
3. **Run analysis**: `python main.py`
4. **Open dashboard**: http://localhost:5601
5. **Explore visualizations**

---

**🔗 Related Documentation**
- [Elasticsearch Guide](https://www.elastic.co/guide/)
- [Kibana Dashboard Guide](https://www.elastic.co/guide/kibana/)
- [Neo4j Graph Database](https://neo4j.com/docs/)
