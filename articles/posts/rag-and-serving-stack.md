---
title: "RAG and serving: FAISS vs Qdrant vs pgvector, FastAPI, MLflow"
date: 2026-11-08
summary: "How I pick a vector store, run local LLMs through Ollama, and serve RAG behind FastAPI and Redis, drawn from Waffarha's bilingual assistant and recommender, with notes on Whisper speech-to-text and MLflow tracking."
tags: [RAG, LLM, Vector Databases]
draft: false
---

This is a working guide to the retrieval-and-serving half of my skill set: vector stores, local LLMs, FastAPI, Redis, speech-to-text and experiment tracking. Evidence: drawn from my production work at Waffarha (the bilingual customer-service assistant and the nightly recommender), my graduation project, and two portfolio ML projects, all linked below. Where a number appears, it comes from an eval report or a source file, and I say what it measures.

## Choosing a vector store: measure first, then pick for operations

In August 2026 I benchmarked five vector stores on the same 1,690 documents, holding the embedding model fixed (`multilingual-e5-base`) so any difference came from the store.

| Store | Load time (s) | Index size (MB) | Recall@3 | Avg query latency (ms) |
|---|---|---|---|---|
| FAISS | 0.071 | 4.95 | 0.881 | 0.62 |
| Chroma | 2.206 | 17.48 | 0.881 | 7.59 |
| Qdrant | 2.728 | 13.93 | 0.881 | 22.53 |
| LanceDB | 4.193 | 5.61 | 0.881 | 26.99 |
| pgvector | 0.126 | 0.66 | 0.847 | 65.06 |

The first lesson is in the recall column. Four stores returned identical recall, most likely because at a few thousand documents they all end up doing near-exact cosine search over the same vectors. At that scale the store does not decide quality; the embedding model and the chunking do. The store decides how you deploy, back up and filter. pgvector was the exception, with lower recall and the slowest queries in that run, which is exactly why I would re-measure before trusting it.

What actually shipped in September 2026 was `BAAI/bge-m3` embeddings in Qdrant over a 9,106-document index (96 FAQs and 9,010 offers), with BM25 alongside and reciprocal rank fusion on top. In the same benchmark, E5-large had the best recall (94.9% on an 89-question set), so the shipped model was not the benchmark winner. The sources don't record why; the comparison is in [Retrieval hit rate isn't answer accuracy](../articles/bilingual-rag-retrieval-hit-rate.html). The November code defaults are bge-m3 with pgvector, and that pairing has not been re-measured.

### Pattern: one interface, every backend behind it

The way I keep that choice reversible is a small abstract class that every store implements, plus a factory:

```python
class FaissStore(VectorStore):
    name = "faiss"

    def build(self, embeddings, docs):
        import faiss
        dim = embeddings.shape[1]
        # IndexFlatIP on normalized vectors == cosine similarity, exact (no ANN
        # approximation) -- the right default at FAQ+offer corpus scale
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(embeddings.astype("float32"))
```

`get_store(name, persist_path)` returns FAISS, Chroma, Qdrant, LanceDB, pgvector or a BM25 index, and the config line `VECTOR_STORE_BACKEND: str = "pgvector"  # faiss | chroma | pgvector | qdrant` is the only thing that changes between them. That is what made the five-way benchmark cheap to run, and it is why moving the default from Qdrant to pgvector was a config change rather than a rewrite.

### Mistakes I made with Qdrant

- **One collection name for every model.** Qdrant in server mode is shared across builds. With a fixed collection name, each embedding model silently overwrote the last one. The fix was to derive the collection name from the index path, so every `data/index/<model>/qdrant/` build gets its own collection.
- **Embedded mode is single-process.** `QdrantClient(path=...)` locks the folder, and a second client on the same path fails with "already accessed by another instance". Scripts and the API can't share an embedded index; use server mode for that.
- **Filters need to be planned at index time.** I wanted a native "offer is still live" filter. The payload stored expiry as a string, the client version's range filter only accepts floats, and there was no datetime payload index. Rather than reindex, every backend over-fetches and drops expired offers before scoring. It works, but it is the kind of decision to make before the first build.

## Measuring a RAG: two numbers, never one

My rule is to score retrieval and the full pipeline in the same run, on the same index. In September 2026 retrieval passed 151 of 172 checkable cases (an 87.8% hit rate), while the full pipeline passed 64 of 225. The hit rate says the right document reached the model. It says nothing about whether the answer was right, which is why I never report it as accuracy.

Most of the gap was in answering, not finding, and that is what pushed me toward [deterministic gates before the LLM](../articles/deterministic-gates-before-llm.html): plain rules that answer or refuse many questions before any model call, plus checks on every price and date the model writes. An older harness on the earlier FAISS + `qwen2.5:1.5b` version scored 106 of 110, but that suite was smaller and has been superseded by the 225-case, 20-category suite, so I don't lead with it.

## Local LLMs through Ollama

I reach for Ollama when the model has to run on hardware we control and when I want to swap models with a tag change. The same August benchmark compared eight local models on keyword coverage and speed:

```text
model                      coverage  tok/s   (Arabic coverage)
qwen2.5:3b-instruct          0.650    50.0     0.455
aya-expanse:8b               0.644     5.0     0.477
granite3.1-moe:3b            0.606    88.8     0.455
llama3.2                     0.573    45.6     0.386
```

(Four of the eight rows shown; the full table is in the eval report.) Two things stood out. The compact MoE model was the fastest by a wide margin with only a small coverage loss, and no model passed 0.48 coverage on Arabic. That second point is a reason to put effort into retrieval, rules and fact-checking rather than hoping a bigger local model fixes Arabic.

The model now serving inside Chatwoot is a LoRA fine-tune of `Qwen3-4B-Instruct-2507` on FAQ-grounded data, merged into the base weights and served through Ollama as `waffarha-support:4b`. The merge was needed because Ollama dropped LoRA adapter support, as described in [Redacting 160k support chats](../articles/redacting-160k-support-chats.html). Its only evaluation so far is a 19-20 case routing check, so I describe it as deployed, not as measured.

In the Compose stack, two Ollama settings do most of the work: `OLLAMA_MAX_LOADED_MODELS=1` so a second model can't push the first out of memory, and `OLLAMA_KEEP_ALIVE=-1` so the model stays loaded between requests instead of paying the load time on the first message after a quiet spell.

## Serving: FastAPI in front, Redis for state

FastAPI is my default service layer: the assistant streams answers over server-sent events, the [Waffy agent prototype](../articles/agent-that-cant-go-rogue.html) is a FastAPI service, and the [nightly recommender](../articles/fail-open-nightly-recommender.html) exposes `/status`, `/run-now` and `/recommend` behind a Google OAuth dashboard.

Redis holds session memory: the last ten turns and the last few offers shown, keyed per session with a one-hour TTL. The design rule I follow is that Redis improves answers but is never required to give one:

```python
    try:
        memory_store = await get_memory_store_async()
    except RedisError as e:
        # Session memory is a nice-to-have (better follow-up resolution),
        # not required to answer
        log.warning("Redis unavailable, continuing without session memory: %s", e)
        memory_store = None
```

The same pattern wraps the read before generation and the write after it, so a Redis outage costs follow-up quality ("how much was it before the discount?") but never drops an answer that was already generated. Redis calls go through `asyncio.to_thread` so blocking network I/O stays off the event loop, and `MEMORY_BACKEND=local` swaps in an in-process dict for tests.

!!! note "Two serving mistakes worth naming"
    `remember_turns` reads the list, then deletes and rewrites it in a pipeline. Two concurrent requests on one session can lose a turn; the code says so in a comment, and an atomic `LPUSH` + `LTRIM` would fix it. In the recommender, the nightly scheduler is a `time.sleep` loop started from the FastAPI lifespan, so running more than one worker would run the night twice. The project's own status notes flag it and suggest moving the schedule out to Jenkins or cron.

My graduation project shows the other side of serving. The Django app my team built called a teammate's hosted model through `gradio_client`, synchronously, with a new client per request and no timeout, and it only ever received one answer string. Since then I always want the retrieved passages back alongside the answer, and a timeout on every model call. The full write-up is in [My graduation-project Arabic QA app](../articles/arabic-rag-graduation-project.html).

## Speech-to-text: what "(lab)" means

The Whisper work is a voice lab I built for Waffarha: a FastAPI test bench on port 8002 that lazy-loads one model at a time so it fits a 4 GB GPU. On the STT side it loads Faster-Whisper `small` in int8 as the baseline, two community Arabic fine-tunes (a dialectal Whisper-small and an Egyptian Whisper-medium) and Qwen3-ASR 0.6B, next to a set of Egyptian and Saudi TTS voices. It is a listening bench, not a benchmark: the notes recorded so far are TTS ratings, and there are no word-error-rate results for the Whisper models.

The assistant's voice channel takes a different route. Its code sends audio to Deepgram (or ElevenLabs) for transcription, and sherpa-onnx is there as the offline text-to-speech fallback when cloud TTS is unavailable, not as a speech recogniser. The research note behind it makes the point I agree with most: vendor WER figures don't transfer to your own phone audio, so the choice should be gated on a set of about 200 of your own clips.

## MLflow: tracking in the portfolio ML projects

I use MLflow for experiment tracking in two portfolio projects on synthetic data. In the [credit-risk pipeline](../articles/credit-risk-mlops-loop.html), each candidate model gets its own run:

```python
with mlflow.start_run(run_name=f"{model_type}_{run_id}"):
    mlflow.log_param("model_type", model_type)
    mlflow.log_param("train_size", len(X_train))
    ...
    for metric_name, value in metrics.items():
        if isinstance(value, (int, float)):
            mlflow.log_metric(metric_name, value)
```

The [fraud-scoring project](../articles/fraud-scoring-kafka.html) logs the same way. Neither repo contains saved runs, and both save models with joblib rather than the registry, so I don't quote model scores from them. One small mistake: the credit-risk Compose service runs `pip install mlflow` unpinned every time the container starts. A pinned image would make the tracking server reproducible.

## When I'd choose something else

- **Under ~10k documents, exact search is enough.** FAISS `IndexFlatIP` or pgvector inside an existing Postgres, chosen for operations, not recall.
- **When filters matter**, Qdrant with payload indexes designed at build time, or pgvector so filters are plain SQL `WHERE` clauses next to the relational data.
- **When Arabic quality matters more than latency**, a hosted model behind the same interface, kept only after it passes the same 225-case suite.
- **When state must be exact** (proposals, rate limits across workers), Redis with atomic commands or Postgres, not a read-modify-write on a list.

[Get in touch](../index.html#contact).
