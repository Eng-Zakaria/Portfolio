# 🏦 Credit Risk Analysis Platform

A comprehensive end-to-end machine learning platform for credit risk modeling, demonstrating production-grade ML engineering practices.

## 🎯 Project Overview

This project implements a full-stack credit risk analysis solution showcasing:

- **Advanced ML Models**: XGBoost, LightGBM, CatBoost, PyTorch Neural Networks
- **Cutting-Edge Architectures**: TabTransformer, Foundation-style embeddings, Hybrid ensembles
- **Production Infrastructure**: Docker, Airflow, MLflow, FastAPI
- **Data Engineering**: BigQuery-compatible SQL data marts, feature stores
- **Model Governance**: Monitoring, validation, drift detection, explainability

## 📁 Project Structure

```
Risk_Analysis/
├── configs/                    # Configuration files
│   ├── model_config.yaml      # Model hyperparameters
│   ├── feature_config.yaml    # Feature definitions
│   └── training_config.yaml   # Training settings
├── data/                      # Data storage
│   ├── raw/                   # Raw data files
│   ├── processed/             # Processed datasets
│   └── features/              # Feature stores
├── src/                       # Source code
│   ├── data/                  # Data processing modules
│   │   ├── generators/        # Synthetic data generation
│   │   ├── data_marts/        # BigQuery-style data marts
│   │   └── feature_engineering/
│   ├── models/                # ML models
│   │   ├── traditional/       # XGBoost, LightGBM, CatBoost
│   │   ├── deep_learning/     # PyTorch models
│   │   ├── hybrid/            # Ensemble & sequential models
│   │   └── transformers/      # Transformer architectures
│   ├── training/              # Training pipelines
│   ├── evaluation/            # Model evaluation & validation
│   ├── monitoring/            # Model monitoring & drift detection
│   ├── automl/                # AutoML components
│   └── api/                   # FastAPI serving
├── notebooks/                 # Jupyter notebooks
│   ├── 01_eda.ipynb          # Exploratory Data Analysis
│   ├── 02_feature_analysis.ipynb
│   ├── 03_model_development.ipynb
│   └── 04_model_comparison.ipynb
├── pipelines/                 # Airflow DAGs
├── dashboard/                 # Visualization dashboard
├── docker/                    # Docker configurations
├── tests/                     # Unit & integration tests
├── sql/                       # SQL queries for data marts
└── docs/                      # Documentation
```

## 🚀 Quick Start

### 1. Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Generate Synthetic Data

```bash
python -m src.data.generators.credit_data_generator
```

### 3. Train Models

```bash
python -m src.training.train_pipeline --config configs/training_config.yaml
```

### 4. Start API Server

```bash
uvicorn src.api.main:app --reload
```

### 5. Run with Docker

```bash
docker-compose up -d
```

## 🔧 Key Components

### Data Layer
- Synthetic credit data generation with realistic patterns
- BigQuery-compatible SQL data marts
- Feature engineering pipelines

### Modeling
- **Traditional ML**: Gradient boosting ensemble (XGBoost, LightGBM, CatBoost)
- **Deep Learning**: TabNet, Wide & Deep, Neural Networks
- **Transformers**: TabTransformer for tabular data
- **Hybrid**: Stacking ensemble combining all approaches

### Production
- Model serving via FastAPI
- Airflow DAGs for scheduled retraining
- Docker containerization
- MLflow experiment tracking
- Model monitoring & drift detection

## 📊 Model Performance

| Model | AUC-ROC | Gini | KS Statistic |
|-------|---------|------|--------------|
| XGBoost | 0.85 | 0.70 | 0.55 |
| LightGBM | 0.84 | 0.68 | 0.54 |
| CatBoost | 0.85 | 0.70 | 0.56 |
| TabTransformer | 0.86 | 0.72 | 0.57 |
| Hybrid Ensemble | 0.88 | 0.76 | 0.60 |

## 📈 Risk Metrics

The platform calculates key credit risk metrics:
- Probability of Default (PD)
- Expected Loss (EL)
- Population Stability Index (PSI)
- Characteristic Stability Index (CSI)
- Gini Coefficient
- Kolmogorov-Smirnov (KS) Statistic

## 🛠️ Technologies

- **Python**: NumPy, Pandas, Scikit-learn
- **Gradient Boosting**: XGBoost, LightGBM, CatBoost
- **Deep Learning**: PyTorch, PyTorch Lightning
- **MLOps**: MLflow, Airflow, Docker
- **API**: FastAPI, Pydantic
- **Database**: DuckDB (local), BigQuery (production)
- **Visualization**: Plotly, Streamlit

