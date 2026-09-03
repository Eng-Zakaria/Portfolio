# Model Documentation

## Overview

This document describes the machine learning models used in the Credit Risk Analysis platform.

## Models

### 1. XGBoost Classifier

**Type**: Gradient Boosting Decision Tree

**Use Case**: Fast, accurate baseline model

**Key Hyperparameters**:
- `max_depth`: 6 (controls tree depth)
- `learning_rate`: 0.05 (step size)
- `n_estimators`: 500 (number of trees)
- `subsample`: 0.8 (row sampling)
- `colsample_bytree`: 0.8 (column sampling)

**Strengths**:
- Fast training and inference
- Handles missing values natively
- Good feature importance extraction
- Regularization options

### 2. LightGBM Classifier

**Type**: Gradient Boosting Decision Tree (leaf-wise)

**Use Case**: Large datasets, categorical features

**Key Hyperparameters**:
- `num_leaves`: 31 (max leaves per tree)
- `max_depth`: 6 (tree depth limit)
- `learning_rate`: 0.05
- `min_child_samples`: 20 (min samples per leaf)

**Strengths**:
- Fastest training among GBDTs
- Efficient memory usage
- Native categorical handling
- Excellent for large datasets

### 3. CatBoost Classifier

**Type**: Gradient Boosting with Ordered Boosting

**Use Case**: Categorical-heavy data, production stability

**Key Hyperparameters**:
- `depth`: 6
- `iterations`: 500
- `learning_rate`: 0.05
- `l2_leaf_reg`: 3.0 (L2 regularization)

**Strengths**:
- Best categorical feature handling
- Robust to overfitting
- Fast inference
- Production-ready

### 4. Neural Network (CreditRiskNN)

**Type**: Deep Feedforward Network

**Use Case**: Complex feature interactions, embeddings

**Architecture**:
```
Input (N features)
    │
    ▼
Linear(N, 256) → BatchNorm → ReLU → Dropout(0.3)
    │
    ▼
Linear(256, 128) → BatchNorm → ReLU → Dropout(0.3)
    │
    ▼
Linear(128, 64) → BatchNorm → ReLU → Dropout(0.3)
    │
    ▼
Linear(64, 32) → BatchNorm → ReLU → Dropout(0.3)
    │
    ▼
Linear(32, 1) → Sigmoid
    │
    ▼
Output (Probability)
```

**Key Features**:
- Batch normalization for training stability
- Dropout for regularization
- Focal loss for class imbalance
- Early stopping with patience

### 5. TabTransformer

**Type**: Transformer for Tabular Data

**Use Case**: Learning feature interactions, categorical embeddings

**Architecture**:
- Categorical features → Embeddings → Transformer Blocks
- Numerical features → BatchNorm → MLP
- Combined → Final MLP → Prediction

**Key Components**:
- Multi-head self-attention (8 heads)
- 6 transformer blocks
- Column-specific embeddings
- Residual connections

**Strengths**:
- Learns complex feature interactions
- Produces meaningful embeddings
- State-of-the-art for tabular data

### 6. Hybrid Stacking Ensemble

**Type**: Meta-learning Ensemble

**Use Case**: Maximum prediction accuracy

**Architecture**:
```
Level 0 (Base Models):
┌─────────┬─────────┬─────────┬─────────┬───────────┐
│ XGBoost │ LightGBM│ CatBoost│   NN    │ TabTrans. │
└────┬────┴────┬────┴────┬────┴────┬────┴─────┬─────┘
     │         │         │         │          │
     ▼         ▼         ▼         ▼          ▼
Level 1 (Out-of-Fold Predictions):
┌────────────────────────────────────────────────────┐
│            Stacked Predictions Matrix              │
└────────────────────────────────────────────────────┘
                        │
                        ▼
Level 2 (Meta-Learner):
┌────────────────────────────────────────────────────┐
│              Logistic Regression                   │
└────────────────────────────────────────────────────┘
                        │
                        ▼
                 Final Prediction
```

**Training Process**:
1. Generate OOF predictions for each base model
2. Stack predictions as meta-features
3. Train meta-learner on stacked features
4. Retrain base models on full data

## Evaluation Metrics

### Primary Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| AUC-ROC | Area under ROC curve | > 0.80 |
| Gini | 2 × AUC - 1 | > 0.60 |
| KS Statistic | Max separation of distributions | > 0.40 |

### Secondary Metrics

| Metric | Description |
|--------|-------------|
| Log Loss | Probabilistic accuracy |
| Brier Score | Mean squared error of probabilities |
| Lift@10% | Lift in top decile |

### Business Metrics

| Metric | Formula |
|--------|---------|
| Expected Loss | PD × LGD × EAD |
| Population Stability Index | Distribution shift measure |

## Model Validation

### Validation Checks

1. **Performance Thresholds**
   - AUC ≥ 0.70
   - Gini ≥ 0.40
   - KS ≥ 0.30

2. **Overfitting Detection**
   - Train-test AUC gap < 0.05

3. **Stability**
   - PSI < 0.20

4. **Monotonicity**
   - Key features show expected relationships

## Model Governance

### Version Control
- All models versioned with semantic versioning
- MLflow tracks experiments and artifacts

### Monitoring
- Daily performance tracking
- Weekly drift detection
- Automated retraining triggers

### Documentation
- All models documented in MLflow
- Feature importance logged
- Validation reports generated

## Retraining Policy

### Triggers
- Scheduled: Weekly (Sunday midnight)
- On-demand: PSI > 0.20
- Performance: AUC drops > 5%

### Strategy
- Full retraining on recent data
- Champion-challenger comparison
- Gradual rollout (canary deployment)

