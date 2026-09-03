# Credit Risk Analysis Platform
# Multi-stage build for optimal image size

# ============================================
# Base Stage - Python dependencies
# ============================================
FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# ============================================
# Development Stage
# ============================================
FROM base as development

# Install development dependencies
RUN pip install --no-cache-dir \
    pytest \
    pytest-cov \
    black \
    flake8 \
    mypy \
    jupyter \
    ipykernel

# Copy source code
COPY . .

# Create directories
RUN mkdir -p data/raw data/processed data/features models monitoring

# Expose ports
EXPOSE 8000 8888

# Default command for development
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ============================================
# Training Stage
# ============================================
FROM base as training

# Copy source code
COPY src/ ./src/
COPY configs/ ./configs/
COPY pipelines/ ./pipelines/

# Create directories
RUN mkdir -p data/raw data/processed models mlruns

# Run training as default
CMD ["python", "-m", "src.training.train_pipeline"]

# ============================================
# Production API Stage
# ============================================
FROM base as production

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy only necessary files
COPY src/ ./src/
COPY configs/ ./configs/
COPY models/ ./models/

# Create directories and set permissions
RUN mkdir -p data models monitoring \
    && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run production API
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

