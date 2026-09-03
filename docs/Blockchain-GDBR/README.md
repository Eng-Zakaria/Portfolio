# Blockchain GDPR Transaction Data Aggregator

A comprehensive pipeline for blockchain transaction analytics with GDPR/PCI compliance, data masking, and market data aggregation.

## Features

- **Blockchain Data Ingestion**: Ethereum and Bitcoin transaction data collection
- **GDPR/PCI Compliance**: Automated data masking, audit logs, and privacy controls
- **Transaction Flow Analysis**: Advanced analytics for blockchain transaction patterns
- **Market Data Aggregation**: Real-time stock and crypto price collection
- **Efficient Storage**: Optimized database schema for query-ready datasets
- **API Endpoints**: RESTful API for data access and analysis

## Architecture

```
├── src/
│   ├── compliance/          # GDPR/PCI compliance pipeline
│   ├── blockchain/          # Blockchain data ingestion
│   ├── analytics/           # Transaction flow analysis
│   ├── market/              # Market data aggregation
│   ├── storage/             # Database operations
│   ├── api/                 # REST API endpoints
│   └── utils/               # Shared utilities
├── config/                  # Configuration files
├── tests/                   # Test suite
├── docs/                    # Documentation
└── scripts/                 # Deployment and utility scripts
```

## Quick Start

1. Install dependencies: `pip install -r requirements.txt`
2. Configure environment: `cp .env.example .env`
3. Initialize database: `python scripts/init_db.py`
4. Run services: `python main.py`

## Compliance Features

- **Data Masking**: Automatic PII detection and masking
- **Audit Logging**: Complete audit trail for all data operations
- **Access Control**: Role-based permissions for sensitive data
- **Data Retention**: Automated cleanup policies
- **Encryption**: End-to-end encryption for sensitive fields
