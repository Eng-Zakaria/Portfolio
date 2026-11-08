---
title: "Retrieval hit rate isn't answer accuracy: measuring a bilingual (Arabic/English) RAG"
date: 2026-11-08
summary: "How I benchmarked and evaluated retrieval for Waffarha's Arabic/English customer-service assistant, and why an 87.8% retrieval hit rate sat next to a 28.4% end-to-end score in the same run."
tags: [RAG, Evaluation, Arabic NLP]
draft: false
sources:
  - C:\Users\devza\Work\Waffarha\waffarha-unified-chatbot\eval\EVALUATION_REPORT.md
  - C:\Users\devza\Work\Waffarha\local_llm_agent\eval\results\summary_report.md
  - C:\Users\devza\Work\Waffarha\local_llm_agent\eval\dataset.json
  - C:\Users\devza\Work\Waffarha\waffarha-chatbot\data\index\BAAI__bge-m3\qdrant\index_manifest.json
  - C:\Users\devza\Work\Waffarha\waffarha-unified-chatbot\eval\queries.json
  - C:\Users\devza\Work\Waffarha\waffarha-unified-chatbot\backend\app\core\config.py
  - C:\Users\devza\Work\Waffarha\waffarha-unified-chatbot\docs\STATE.md
---

This is production work at Waffarha, where I am a data engineer. It covers how I measured the retrieval side of our customer-service assistant, which answers questions about offers and FAQs in Egyptian Arabic and English. The headline number from that work is 87.8%. This article is mostly about what that number does not mean.

## The problem: one number, two very different questions

A RAG assistant can fail in two places. It can fail to find the right document, or it can find the right document and still give a wrong or unhelpful answer. These need separate measurements, and it is easy to report the first one as if it were the second.

In the September 2026 evaluation run, retrieval passed 151 of 172 checked cases (87.8%). In the same run, the full pipeline, retrieval plus generation, passed 64 of 225 cases (28.4%). Same index, same queries, same day. If I had only published the first number, it would have described a system much better than the one we had.

The gap is not a mystery once you look at it per category. `offer_direct_answer` retrieved correctly in 49 of 52 checked cases but answered correctly in 11 of 56. `faq_direct_answer` retrieved correctly in 21 of 24 but answered correctly in 2 of 25. The report's own conclusion was that the gap is in generation and answering, not in finding.

## Setup

### The evaluation suite

The suite in `eval/queries.json` has 225 cases across 20 categories. Each case carries a query, a language tag, expected keywords and, where it makes sense, an expected source document. The language mix reflects real traffic: 203 Arabic, 11 English and 11 mixed-script cases.

The categories cover more than lookups. The largest are direct offer questions (56), category browsing (39) and FAQ questions (25). Then come follow-ups that depend on conversation memory (12), adversarial input (11), out-of-scope questions (11), greetings, price ranges, ranking ("cheapest"), fuzzy merchant names, hallucination checks for merchants that do not exist, prompt injection, and a few small edge-case groups.

Not every case has a retrievable right answer. Many greetings, prompt-injection attempts and out-of-scope questions have no expected document at all. Retrieval was scored only on the cases the harness could check against an expected document, 172 of them, while the full pipeline was scored on all 225. The report does not break down exactly which cases fell outside the 172, which is something I would make explicit next time.

### The index

The index used for that run was built with `BAAI/bge-m3` embeddings and stored in Qdrant. Its manifest records 9,106 documents: 96 FAQ entries and 9,010 offers. The report lists it as covering 2,923 merchants, with an engine load time of about 84 seconds. Retrieval was hybrid: dense embeddings plus BM25, fused with reciprocal rank fusion. The generator in that run was `qwen2.5:3b-instruct`.

### How the hit rate is computed

The retrieval metric is simple, and the simplicity matters. A case counts as a hit if its expected source shows up in the retrieved set. Cases with no expected source are skipped, not counted as passes.

```python
def retrieval_hit_rate(cases, retrieve, k):
    checked = hits = 0
    for case in cases:
        expected = case.get("expected_source")
        if not expected:          # greetings, injections, out-of-scope
            continue              # not checked, not a pass
        checked += 1
        top_ids = [doc.id for doc in retrieve(case["query"], k=k)]
        if expected in top_ids:
            hits += 1
    return hits, checked          # e.g. 151, 172
```

Nothing in this function looks at the answer. A hit means the right document was available to the model. It says nothing about whether the model used it, quoted the right price, or stayed in the right language.

## Decisions and trade-offs

### Decision 1: benchmark embeddings and vector stores separately

In August 2026 I ran a benchmark on a separate 89-question set: four embedding models and five vector stores. To keep the comparison clean, I held the embedding model fixed (`multilingual-e5-base`) while comparing stores, so any difference came from the store.

| Embedding model | Recall | MRR | Recall (ar) | Recall (en) | Avg query latency (ms) |
|---|---|---|---|---|---|
| multilingual-e5-large | 0.949 | 0.836 | 0.9 | 0.973 | 80.389 |
| multilingual-e5-base | 0.881 | 0.766 | 0.8 | 0.919 | 48.555 |
| BAAI/bge-m3 | 0.864 | 0.768 | 0.85 | 0.892 | 77.906 |
| paraphrase-multilingual-mpnet-base-v2 | 0.661 | 0.508 | 0.55 | 0.757 | 38.157 |

For the stores, FAISS, Chroma, Qdrant and LanceDB all returned the same recall@3 (0.881) and MRR@3 (0.766) on 1,690 documents. They differed only in load time, index size and latency; FAISS had the fastest queries at 0.62 ms. pgvector was the exception, with lower recall@3 (0.847) and the slowest queries at 65.06 ms.

The trade-off: splitting the benchmark this way makes each table easy to read, but it never tests the combination we actually ran. The shipped pairing, bge-m3 on Qdrant, does not appear as a measured row in either table.

### Decision 2: shipping a model that lost the benchmark

E5-large won every column of the embedding benchmark, including Arabic recall. The September index used bge-m3, which placed third on overall recall.

I would like to give a clear reason for that choice, but the sources do not record one. The only related note is in the earlier evaluation report, which listed bge-m3 as an alternative to try because it is "often superior for Arabic/MENA content." That is a general claim, not something our benchmark showed: on our Arabic questions, bge-m3 scored 0.85 against E5-large's 0.9.

There is one detail that makes the benchmark weaker evidence than it looks. The 89-question set was 54 English, 29 Arabic and 6 Franco (Arabizi) questions. The production suite is mostly Arabic. So the benchmark was weighted toward the language our customers use least. The Franco column, where E5-large scored 1.0 and bge-m3 scored 0.5, rests on only 6 questions.

What I would measure before defending either choice: run E5-large and bge-m3 through the same 225-case suite on the same index contents, and report hit rate per language and per category, not one overall figure.

### Decision 3: score retrieval and the full pipeline in the same run

I kept both suites in one run, against one index, so the two numbers could be compared directly. The cost is that the end-to-end number is unflattering and harder to explain. The benefit is that it points to where the work is. Retrieval for category browsing passed 33 of 34 checked cases. End-to-end, the same category passed 16 of 39. Better embeddings would not have closed that gap.

!!! warning "Read the denominator"
    151/172 and 64/225 come from the same run but use different denominators. The retrieval figure covers only cases checkable against an expected document. The end-to-end figure includes every case, including greetings and injection attempts. Neither number should be reported without the other.

## Results, with caveats

| Measure | Result | What it covers |
|---|---|---|
| Retrieval hit rate | 151/172 (87.8%) | Checked cases only |
| Full pipeline | 64/225 (28.4%) | All cases, qwen2.5:3b-instruct |
| Earlier retrieval run (Aug 2026) | 84/105 (80.0%) | e5-base + FAISS, 145-case suite |

Some honest caveats:

- The August and September runs used different suites (145 and 225 cases), different indexes (1,458 and 9,106 documents) and different models. The jump from 80.0% to 87.8% is not a controlled comparison.
- Weak end-to-end categories included follow-ups that need memory (2 of 12), greetings (1 of 8) and disambiguating offers from the same merchant (0 of 4). Several of these are not retrieval problems at all.
- The current code has moved on. The configuration now defaults to `BAAI/bge-m3` with pgvector as the vector store backend, while the project's state log records the pgvector cutover as deferred in favour of a local knowledge base. Neither setup has been re-measured with the 225-case suite. pgvector was also the one store that scored lower recall in the August benchmark. That was on e5-base, but it is still a reason to measure before assuming the number carries over.

## What I would do next

1. Re-run the 225-case suite on the current configuration and report retrieval and end-to-end numbers together.
2. Run E5-large and bge-m3 head to head on that suite, split by Arabic, English and mixed script, since the existing benchmark leaned English.
3. Measure the shipped pairing directly instead of inferring it from two separate tables.
4. Put most of the effort into the answering stage. The category numbers say that is where most cases are lost.

The lesson I took from this: a retrieval metric is a component test. It is worth tracking, but on its own it does not describe what the customer sees.

[Get in touch](../index.html#contact).
