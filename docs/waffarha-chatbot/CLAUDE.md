# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 Quick Start
- **Start Services**: Ollama (`ollama serve`), Redis (`docker run -d -p 6379:6379 redis:7-alpine`), and the FastAPI server (`uvicorn app:app --reload`).
- **Develop**: Edit code and use `uvicorn --reload` to auto-restart the server.
- **Test**: Run evaluations using `python run_eval.py`.
- **Ingest**: Build indices with `python ingest/build_index.py`.

## 🏗️ Architecture
The Waffarha Assistant is a RAG-powered chatbot with a hybrid intent-based architecture:
1. **API Layer**: `app.py` (FastAPI).
2. **Intent Engine**: `rag_engine.py` orchestrates Personal (ClickHouse), Catalog (structured), FAQ, and Offer lookups before falling back to LLM (Ollama).
3. **Data Layer**: Vector stores (FAISS/Chroma/etc. defined in `vectorstores.py`) and ClickHouse for user-specific data.
4. **Memory**: Redis-backed session memory (`memory.py`).

## 🛠️ Key Commands
- **Eval**: `python run_eval.py [--queries <file>] [--backend <backend>]`
- **Build Index**: `python ingest/build_index.py [--backend <backend>]`
- **Lint/Type Check**: `ruff check .` and `mypy app.py rag_engine.py config.py`

## 📦 Documentation Reference
Detailed documentation is maintained in:
- `README.md`: Project overview & quick start.
- `ARCHITECTURE.md`: RAG pipeline and design decisions.
- `DEVELOPMENT.md`: Detailed dev workflow, debugging, and testing.
- `DOCKER.md`: Docker deployment guide.
- `EVALUATION.md`: Evaluation harness and test design.
