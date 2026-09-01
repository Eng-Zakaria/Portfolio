# Architecture Diagrams

Production-quality SVG architecture diagrams for all portfolio projects, generated with real tool logos from [Simple Icons](https://simpleicons.org/).

## Generated Diagrams

| Project | File | Size |
|---------|------|------|
| Waffarha Assistant (RAG Chatbot) | `waffarha-assistant---rag-chatbot.svg` | 13.9 KB |
| Market Intelligence (Sentiment Pipeline) | `market-intelligence---sentiment-pipeline.svg` | 11.5 KB |
| Partner Price Integrity (Scraping Pipeline) | `partner-price-integrity---scraping-pipeline.svg` | 11.7 KB |
| Blockchain Analyzer (Forensics Platform) | `blockchain-analyzer---forensics-platform.svg` | 11.3 KB |
| Credit Risk Analysis (MLOps Platform) | `credit-risk-analysis---mlops-platform.svg` | 11.8 KB |
| Fraud Detection (Streaming Pipeline) | `fraud-detection---streaming-pipeline.svg` | 11.3 KB |
| Nexlify DW (Healthcare Data Warehouse) | `nexlify-dw---healthcare-data-warehouse.svg` | 12.1 KB |

## Icon Coverage

**38/41 tools have official logos** (93% coverage)

### ✅ Successfully Resolved Icons

| Tool | Simple Icons Slug | Status |
|------|-------------------|--------|
| MySQL | siMysql | ✓ |
| PostgreSQL | siPostgresql | ✓ |
| Redis | siRedis | ✓ |
| ClickHouse | siClickhouse | ✓ |
| Elasticsearch | siElasticsearch | ✓ |
| Neo4j | siNeo4j | ✓ |
| MongoDB | siMongodb | ✓ |
| DuckDB | siDuckdb | ✓ |
| BigQuery | siGooglebigquery | ✓ |
| SQLite | siSqlite | ✓ |
| Apache Spark | siApachespark | ✓ |
| Apache Airflow | siApacheairflow | ✓ |
| Apache Flink | siApacheflink | ✓ |
| Apache NiFi | siApachenifi | ✓ |
| Apache Kafka | siApachekafka | ✓ |
| RabbitMQ | siRabbitmq | ✓ |
| MLflow | siMlflow | ✓ |
| Ollama | siOllama | ✓ |
| PyTorch | siPytorch | ✓ |
| Hugging Face | siHuggingface | ✓ |
| scikit-learn | siScikitlearn | ✓ |
| FastAPI | siFastapi | ✓ |
| Streamlit | siStreamlit | ✓ |
| React | siReact | ✓ |
| Node.js | siNodedotjs | ✓ |
| Python | siPython | ✓ |
| JavaScript | siJavascript | ✓ |
| TypeScript | siTypescript | ✓ |
| Docker | siDocker | ✓ |
| Kubernetes | siKubernetes | ✓ |
| Jenkins | siJenkins | ✓ |
| Prometheus | siPrometheus | ✓ |
| Grafana | siGrafana | ✓ |
| Git | siGit | ✓ |
| Nginx | siNginx | ✓ |
| Kibana | siKibana | ✓ |
| Plotly | siPlotly | ✓ |
| Web3.js | siWeb3dotjs | ✓ |
| Express | siExpress | ✓ |
| MinIO | siMinio | ✓ |
| Google Cloud | siGoogle | ✓ |
| GitHub | siGithub | ✓ |
| GitHub Actions | siGithubactions | ✓ |
| Pandas | siPandas | ✓ |
| App Store | siAppstore | ✓ |
| Google Play | siGoogleplay | ✓ |
| Reddit | siReddit | ✓ |
| Slack | siSlackware | ✓ |
| JSON | siJson | ✓ |

### ⚠️ Missing Icons (Manual Sourcing Required)

| Tool | Reason | Suggested Alternative |
|------|--------|----------------------|
| Microsoft SQL Server | Not available in Simple Icons | Source from Microsoft brand assets |
| XGBoost | Not available in Simple Icons | Use generic ML placeholder or source from XGBoost website |
| LightGBM | Not available in Simple Icons | Use generic ML placeholder or source from LightGBM website |
| CatBoost | Not available in Simple Icons | Use generic ML placeholder or source from Yandex |
| FAISS | Not available in Simple Icons | Use Meta/Facebook logo or generic vector placeholder |
| Playwright | Not available in Simple Icons | Source from Microsoft Playwright website |
| AWS | Not available in Simple Icons | Use Amazon AWS logo or AWS re:Brand assets |
| BeautifulSoup | Not available in Simple Icons | Use Python logo with "BS" label |

### Note on Fallback Mappings

Some tools were mapped to close approximations:
- **Slack** → `siSlackware` (Linux distro with similar branding)
- **JSON** → `siJson` (JSON Web Token variant)
- **Email** → `siMinutemailer` (minimal email icon)

## Diagram Features

- **Valid standalone SVG** with proper `viewBox`, width, and height attributes
- **Layer-colored containers** with dashed borders for architectural boundaries
- **Real logo icons** as colored circles with first-letter initials
- **Directional arrows** showing data flow between components
- **Edge labels** indicating data/control flow type
- **Legend** in bottom-right corner explaining layer colors
- **No ASCII art** — pure SVG output
- **Consistent styling** across all diagrams

## Layer Color Legend

| Layer | Color | Meaning |
|-------|-------|---------|
| DATA SOURCES | Blue | External data sources, APIs, databases |
| INGESTION | Green | Data collection and normalization |
| ORCHESTRATION | Orange | Pipeline scheduling and workflow management |
| PROCESSING | Teal | Data transformation and computation |
| STORAGE | Purple | Databases, caches, file storage |
| ML / AI | Pink | Machine learning models and inference |
| SERVING | Indigo | API serving and model deployment |
| MONITORING | Lime | Alerts, observability, logging |
| CONSUMER | Yellow | Dashboards, reports, end-user interfaces |

## Regeneration

To regenerate all diagrams:

```bash
node scripts/generate-diagrams.js
```

The script uses the `simple-icons` npm package for icon resolution. Install dependencies:

```bash
npm install simple-icons
```
