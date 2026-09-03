# API Documentation

## Overview

The Blockchain GDPR Transaction Data Aggregator provides a comprehensive REST API for accessing blockchain transaction analytics, market data, and compliance information with built-in GDPR/PCI compliance features.

## Base URL

```
http://localhost:8000
```

## Authentication

Currently, the API does not require authentication for development purposes. In production, implement proper authentication using JWT tokens or API keys.

## Response Format

All API responses return JSON with the following structure:

```json
{
  "data": {...},
  "timestamp": "2026-02-22T15:48:00.000Z",
  "status": "success"
}
```

Error responses include:
```json
{
  "error": "Error message",
  "timestamp": "2026-02-22T15:48:00.000Z",
  "status": "error"
}
```

## Endpoints

### Health & Monitoring

#### GET /health
Check system health status.

**Response:**
```json
{
  "overall_status": "healthy",
  "timestamp": "2026-02-22T15:48:00.000Z",
  "checks": {
    "database": {"status": "healthy", "response_time_seconds": 0.05},
    "blockchain_ethereum": {"status": "healthy", "latest_block": 12345678},
    "blockchain_bitcoin": {"status": "healthy", "latest_block_hash": "000000..."},
    "market_data": {"status": "healthy", "data_points_received": 10},
    "compliance": {"status": "healthy"}
  }
}
```

#### GET /metrics
Get system and application metrics.

**Response:**
```json
{
  "system": {
    "cpu": {"percent": 25.5, "count": 8},
    "memory": {"total": 16777216000, "used": 8388608000, "percent": 50.0},
    "disk": {"total": 1000000000000, "used": 500000000000, "percent": 50.0}
  },
  "application": {
    "uptime_seconds": 3600,
    "database": {
      "ethereum": {"transactions_24h": 1000, "volume_24h": 1000000},
      "bitcoin": {"transactions_24h": 500, "volume_24h": 500000}
    }
  }
}
```

### Blockchain Data

#### Ethereum

##### GET /blockchain/ethereum/latest-block
Get the latest Ethereum block number.

**Response:**
```json
{
  "latest_block": 12345678,
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

##### GET /blockchain/ethereum/block/{block_number}
Get Ethereum block by number.

**Parameters:**
- `block_number` (path): Block number
- `include_transactions` (query, optional): Include transaction details (default: true)

**Response:**
```json
{
  "number": 12345678,
  "hash": "0x...",
  "timestamp": "2026-02-22T15:48:00.000Z",
  "transactions": [...],
  "transaction_count": 150
}
```

##### GET /blockchain/ethereum/transaction/{tx_hash}
Get Ethereum transaction by hash.

**Response:**
```json
{
  "hash": "0x...",
  "block_number": 12345678,
  "from_address": "0x1234****5678",
  "to_address": "0xabcd****ef12",
  "value": "1000000000000000000",
  "gas_used": 21000,
  "status": 1
}
```

##### GET /blockchain/ethereum/address/{address}/transactions
Get Ethereum transactions for an address.

**Parameters:**
- `address` (path): Ethereum address
- `start_block` (query, optional): Starting block number
- `end_block` (query, optional): Ending block number
- `limit` (query, optional): Maximum number of transactions (default: 100, max: 1000)

**Response:**
```json
{
  "address": "0x1234****5678",
  "transactions": [...],
  "count": 50,
  "limit": 100
}
```

#### Bitcoin

##### GET /blockchain/bitcoin/latest-block
Get the latest Bitcoin block hash.

**Response:**
```json
{
  "latest_block_hash": "00000000000000000007878ec04bb2b2e12317804810f4c26033585b3f81ffaa",
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

##### GET /blockchain/bitcoin/block/{block_hash}
Get Bitcoin block by hash.

**Response:**
```json
{
  "hash": "000000...",
  "height": 812345,
  "timestamp": "2026-02-22T15:48:00.000Z",
  "transactions": [...],
  "transaction_count": 2000
}
```

##### GET /blockchain/bitcoin/transaction/{txid}
Get Bitcoin transaction by ID.

**Response:**
```json
{
  "txid": "1234567890abcdef...",
  "block_height": 812345,
  "fee": 0.0001,
  "input_count": 1,
  "output_count": 2,
  "total_input_value": 1.0,
  "total_output_value": 0.9999
}
```

### Market Data

#### GET /market/crypto/prices
Get cryptocurrency prices.

**Parameters:**
- `symbols` (query, optional): List of symbols (e.g., ["BTC/USDT", "ETH/USDT"])

**Response:**
```json
{
  "prices": [
    {
      "symbol": "BTC/USDT",
      "price": 50000.0,
      "volume_24h": 1000000000,
      "change_24h": 2.5,
      "source": "binance"
    }
  ],
  "count": 1,
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

#### GET /market/stock/prices
Get stock prices.

**Parameters:**
- `symbols` (query, optional): List of stock symbols (e.g., ["AAPL", "GOOGL"])

**Response:**
```json
{
  "prices": [
    {
      "symbol": "AAPL",
      "price": 150.0,
      "volume": 1000000,
      "change_percent": 1.5,
      "source": "alpha_vantage"
    }
  ],
  "count": 1,
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

#### GET /market/summary
Get comprehensive market summary.

**Response:**
```json
{
  "timestamp": "2026-02-22T15:48:00.000Z",
  "crypto_markets": {
    "total_symbols": 100,
    "average_price": 1000.0,
    "total_volume_24h": 10000000000,
    "top_gainers": [...],
    "top_losers": [...]
  },
  "stock_markets": {
    "total_symbols": 50,
    "average_price": 100.0,
    "total_volume": 5000000000
  }
}
```

#### GET /market/historical/{symbol}
Get historical price data.

**Parameters:**
- `symbol` (path): Trading symbol
- `timeframe` (query): Timeframe (1m, 5m, 15m, 1h, 4h, 1d)
- `limit` (query): Number of data points (max: 1000)

**Response:**
```json
{
  "symbol": "BTC/USDT",
  "timeframe": "1d",
  "data": [
    {
      "timestamp": "2026-02-22T00:00:00.000Z",
      "open": 49000.0,
      "high": 51000.0,
      "low": 48500.0,
      "close": 50000.0,
      "volume": 1000000
    }
  ],
  "count": 100
}
```

### Analytics

#### POST /analytics/flow/analyze
Analyze transaction flows.

**Parameters:**
- `blockchain_type` (query): ethereum or bitcoin
- `start_block` (query, optional): Starting block number
- `end_block` (query, optional): Ending block number

**Response:**
```json
{
  "message": "Flow analysis started",
  "blockchain_type": "ethereum",
  "start_block": 12345000,
  "end_block": 12345678,
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

#### GET /analytics/flow/report
Get flow analysis report.

**Response:**
```json
{
  "report_timestamp": "2026-02-22T15:48:00.000Z",
  "basic_metrics": {
    "total_volume": 1000000.0,
    "transaction_count": 1000,
    "unique_addresses": 500,
    "network_density": 0.1,
    "clustering_coefficient": 0.05
  },
  "anomalies": [...],
  "network_statistics": {
    "nodes": 500,
    "edges": 1000,
    "average_degree": 4.0
  }
}
```

#### GET /analytics/flow/address/{address}
Trace transaction flow for an address.

**Response:**
```json
{
  "address": "0x1234****5678",
  "metrics": {
    "total_sent": 10000.0,
    "total_received": 5000.0,
    "net_flow": -5000.0,
    "outbound_transaction_count": 10,
    "inbound_transaction_count": 5
  },
  "flows": {
    "outbound": [...],
    "inbound": [...]
  }
}
```

#### GET /analytics/anomalies
Get detected transaction anomalies.

**Response:**
```json
{
  "anomalies": [
    {
      "type": "large_amount",
      "transaction_hash": "0x...",
      "amount": 1000000.0,
      "severity": "high"
    }
  ],
  "count": 1,
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

### Database Queries

#### GET /query/transactions
Query transactions with filters.

**Parameters:**
- `blockchain_type` (query): ethereum or bitcoin
- `address` (query, optional): Filter by address
- `start_block` (query, optional): Starting block number
- `end_block` (query, optional): Ending block number
- `start_time` (query, optional): Starting timestamp (ISO format)
- `end_time` (query, optional): Ending timestamp (ISO format)
- `limit` (query, optional): Maximum results (default: 100, max: 1000)
- `offset` (query, optional): Results offset (default: 0)

**Response:**
```json
{
  "blockchain_type": "ethereum",
  "filters": {...},
  "transactions": [...],
  "count": 50,
  "limit": 100,
  "offset": 0
}
```

#### GET /query/market-data
Query market data with filters.

**Parameters:**
- `symbol` (query, optional): Filter by symbol
- `source` (query, optional): Filter by data source
- `asset_type` (query, optional): Filter by asset type (crypto or stock)
- `start_time` (query, optional): Starting timestamp (ISO format)
- `end_time` (query, optional): Ending timestamp (ISO format)
- `limit` (query, optional): Maximum results (default: 100, max: 1000)

**Response:**
```json
{
  "filters": {...},
  "data": [...],
  "count": 100,
  "limit": 100
}
```

#### GET /statistics/transactions
Get transaction statistics.

**Parameters:**
- `blockchain_type` (query): ethereum or bitcoin
- `time_period` (query): 24h, 7d, or 30d

**Response:**
```json
{
  "total_transactions": 1000,
  "total_volume": 1000000.0,
  "average_transaction_size": 1000.0,
  "unique_addresses": 500,
  "time_period": "24h"
}
```

### Compliance

#### GET /compliance/audit-trail
Get audit trail for a user.

**Parameters:**
- `user_id` (query, required): User ID
- `start_date` (query, optional): Start date (ISO format)
- `end_date` (query, optional): End date (ISO format)
- `limit` (query, optional): Maximum results (default: 100, max: 1000)

**Response:**
```json
{
  "user_id": "user123",
  "filters": {...},
  "audit_trail": [
    {
      "id": "audit-123",
      "timestamp": "2026-02-22T15:48:00.000Z",
      "action": "read_transaction",
      "resource_type": "ethereum_transaction",
      "success": true
    }
  ],
  "count": 10,
  "limit": 100
}
```

#### GET /compliance/status
Get compliance system status.

**Response:**
```json
{
  "gdpr_enabled": true,
  "pci_enabled": true,
  "audit_retention_days": 2555,
  "data_retention_days": 365,
  "timestamp": "2026-02-22T15:48:00.000Z"
}
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:
- 100 requests per minute per IP address
- 1000 requests per hour per IP address

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

## Data Masking

All sensitive data is automatically masked according to GDPR/PCI compliance:
- Blockchain addresses are partially masked (e.g., `0x1234****5678`)
- Personal information is fully masked or tokenized
- Financial data may be aggregated for privacy

## Pagination

List endpoints support pagination using `limit` and `offset` parameters. The response includes pagination metadata.

## Webhooks

Webhooks can be configured to receive real-time notifications for:
- New transactions
- Compliance violations
- System alerts

Contact the administrator to configure webhooks.

## SDKs

Official SDKs are available for:
- Python
- JavaScript/TypeScript
- Go

## Support

For API support and questions:
- Documentation: https://docs.example.com
- Issues: https://github.com/example/blockchain-gdpr-transaction-data-aggregator/issues
- Email: api-support@example.com
