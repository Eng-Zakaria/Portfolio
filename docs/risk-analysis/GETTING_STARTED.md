# Getting Started Guide

## Prerequisites

- Python 3.9 or higher
- pip or conda package manager
- Docker (optional, for containerized deployment)
- 8GB RAM minimum (16GB recommended for deep learning)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/company/credit-risk-analysis.git
cd credit-risk-analysis
```

### 2. Create Virtual Environment

```bash
# Using venv
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Or using conda
conda create -n credit-risk python=3.11
conda activate credit-risk
```

### 3. Install Dependencies

```bash
# Core dependencies
pip install -r requirements.txt

# Development dependencies (optional)
pip install -e ".[dev]"
```

### 4. Verify Installation

```bash
python -c "from src.models import XGBoostModel; print('Installation successful!')"
```

## Quick Start

### Generate Sample Data

```bash
python -m src.data.generators.credit_data_generator
```

This creates:
- `data/raw/credit_data.parquet` - Full dataset (100K records)
- `data/raw/credit_data_sample.parquet` - Sample dataset (1K records)

### Train Models

```bash
# Train all models
python -m src.training.train_pipeline

# Train specific models
python -m src.training.train_pipeline --models xgboost lightgbm
```

### Start API Server

```bash
uvicorn src.api.main:app --reload --port 8000
```

Access the API docs at: http://localhost:8000/docs

### Run Dashboard

```bash
streamlit run dashboard/app.py
```

Access the dashboard at: http://localhost:8501

## Using Docker

### Build and Run All Services

```bash
docker-compose up -d
```

Services:
- API: http://localhost:8000
- Dashboard: http://localhost:8501
- MLflow: http://localhost:5000

### Development Mode

```bash
docker-compose --profile development up -d
```

This also starts Jupyter at http://localhost:8888

## Project Structure

```
credit-risk-analysis/
├── src/                    # Source code
│   ├── data/              # Data processing
│   ├── models/            # ML models
│   ├── evaluation/        # Metrics & validation
│   ├── monitoring/        # Drift detection
│   ├── automl/            # AutoML components
│   ├── training/          # Training pipelines
│   └── api/               # FastAPI serving
├── configs/               # Configuration files
├── notebooks/             # Jupyter notebooks
├── pipelines/             # Airflow DAGs
├── dashboard/             # Streamlit app
├── tests/                 # Unit tests
└── docker/                # Docker configs
```

## Next Steps

1. **Explore the Data**: Open `notebooks/01_eda.ipynb`
2. **Train Models**: Run the training pipeline
3. **Evaluate Results**: Check MLflow at http://localhost:5000
4. **Deploy**: Use Docker Compose for production deployment

## Common Issues

### CUDA Not Available
```python
# Force CPU mode
model = CreditRiskNN(device='cpu')
```

### Memory Issues
```python
# Reduce batch size
config = {'batch_size': 128}
```

### Import Errors
```bash
# Add project to path
export PYTHONPATH=$PYTHONPATH:$(pwd)
```

