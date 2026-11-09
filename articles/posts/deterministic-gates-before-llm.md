---
title: "Deterministic gates before the LLM"
date: 2026-11-08
summary: "How the Waffarha bilingual support assistant answers or refuses many questions with plain rules before any model call, checks every price and date the model writes, and what a 225-case eval says about where that works and where it doesn't."
tags: [RAG, Guardrails, Testing]
draft: false
---

This is production work at Waffarha. I build and run the customer-service assistant for
Waffarha's deals platform, which answers in Egyptian Arabic, MSA, English and Franco-Arabic.
This post covers one part of it: the layer of plain rules that runs before any model is called.

## The problem: the model is the slowest, least predictable part

A language model is the most expensive step in a support turn, the slowest, and the only one
that can make things up. In a local-versus-cloud comparison on the same index (6 queries,
recorded in `eval/EVALUATION_REPORT.md`), the local 3B model took about 12 seconds per generated
answer against about 3 seconds for a cloud model. The same comparison showed the 3B model
confabulating on weak context while the cloud model abstained.

The failures I saw in logs were specific. A nonexistent brand scored 0.95+ against some unrelated
real offer and got answered as if it existed. Gibberish scored 0.79 to 0.82 on embedding
similarity, above the relevance floor, and got fabricated offer details. A fake `SYSTEM:` header
in a message once got the reply "access granted". A refund question matched a gym offer because
the Arabic word for "offer" appeared inside the sentence, and the model then roleplayed that
merchant and invented a phone number.

None of these needed a smarter model. They needed the model not to be asked.

## The gate chain

Every turn walks an ordered list of checks. Each gate either returns a final answer, refuses, or
passes the turn on. The model only sees what survives all of them. In the newer pipeline, the
first deterministic pass (code and phone extraction, dialect scoring, Arabizi expansion) is
documented at under 2 ms with no LLM call (`docs/ARCHITECTURE.md`).

| Gate | What it catches | What happens |
|---|---|---|
| Closing / greeting | "شكرا", "that's all", small talk | Polite reply, no retrieval at all |
| Empty / gibberish | Blank or random input | Ask to rephrase, no retrieval |
| Injection | Fake `CONTEXT:`/`SYSTEM:` headers, "ignore instructions" | Short-circuit refusal; the text never reaches the model |
| Unknown or inactive merchant | A brand not in the catalog, or one with only expired offers | Honest "we don't have this", no nearby substitute |
| Out of scope | Weather, medicine, general knowledge | Polite decline |
| Personal / support intent | "my coupons", order and voucher codes | Live lookup scoped to the verified user, never the vector index |
| Branch, hours, stock, superlatives | "فروعها فين؟", "cheapest", "how many left" | Answered from offer metadata or a full sort, not top-k retrieval |
| FAQ topic router | Strong topic keywords ("refund policy", "كود فوري") | Exact FAQ document, even if retrieval ranked a sibling higher |
| Relevance floors | Weak retrieval | Refuse below the strict floor; LLM relevance check in the borderline band |
| FAQ / offer direct answer | One clear, high-similarity match | Rendered answer from the document, no generation |
| Evidence gate (agent path) | Tool returned nothing, no offers, or offers outside the asked price range | Deterministic broadening, then at most one replan, then fallback |
| Fact check (after generation) | Prices, discounts, dates, IDs, phones not in the sources | One retry with critique, then a minimal factual reply |

The thresholds are in `core/config.py`: a soft relevance floor of 0.30, a strict refusal floor of
0.45, and a direct-answer floor of 0.55 on raw embedding similarity. A candidate that only BM25
found carries no embedding score, and the direct-answer shortcut skips it rather than trusting it.

A simplified version of the chain, in my own words:

```python
GATES = [
    closing_or_greeting, empty_or_gibberish, prompt_injection,
    unknown_merchant, inactive_merchant, out_of_scope,
    personal_lookup, branch_hours_stock, faq_topic_router,
]

def answer(turn):
    for gate in GATES:
        result = gate(turn)
        if result is not None:          # answered or refused, no LLM
            return result
    docs = retrieve(turn)
    if best_embedding_score(docs) < STRICT_FLOOR:
        return refuse(turn.lang)
    direct = direct_answer(docs, min_score=DIRECT_FLOOR)
    if direct is not None:
        return direct
    draft = llm_generate(turn, docs)
    return fact_check(draft, docs)      # retry once, else minimal reply
```

## Decisions and trade-offs

### Refusal guards run before every answer path

The refusal guards (unknown merchant, inactive merchant, out of scope) originally ran after the
personal and catalog shortcuts. That meant a structured path could answer a question the main
path would have refused outright. I moved them ahead of every path that produces an answer, so
the same floor gates all of them.

The cost is that the guards must be cheap and correct, because nothing downstream can overrule
them. A false "we don't have this merchant" is a wrong answer delivered confidently. I accepted
that because the alternative, a fabricated offer for a brand Waffarha doesn't sell, is worse for
a support channel.

### Personal data never goes near the embeddings

Questions about a customer's own coupons, orders and refunds go to live ClickHouse lookups scoped
to the resolved user, not to the vector index. The index holds public FAQs and offers only
(9,106 documents across 2,923 merchants in the case study). Personal queries are off by default
(`PERSONAL_QUERIES_ENABLED=false`) and only run once an identity is resolved.

What runs today is narrow on purpose. Queries are fixed templates in the repository. The
renderer refuses a template with missing placeholders or undeclared parameters, escapes every
value through one function, and never lets the model touch table or column names. The client
runs in ClickHouse read-only mode with a row cap.

The plan also describes an 8-layer guarded SQL fallback for analytical questions: lexical
pre-filter, sqlglot AST validation, canonical re-emission, a dedicated read-only role, row-level
security, PII scrubbing, and an audit log. That is a design in `docs/PLAN.md` and the agentic
project's plan, not something I'd claim is in the running path. The trade-off of templates is
coverage: a question no template fits gets a handoff, not an answer.

### Check the claims, not the prose

The fact checker does not judge whether an answer is good. It extracts the things a customer acts
on (amounts, percentages, dates, order and voucher IDs, phone numbers, statuses) and requires
each to appear in the turn's facts after normalizing Arabic-Indic digits. On failure the model
gets one regeneration with a critique; if that fails too, the customer gets a minimal factual
reply and a handoff offer. A separate check makes any 9+ digit phone number or email in an
answer appear somewhere in the user text, history, sources or tool output.

This misses wrong claims that contain no number, like a model describing a policy it doesn't
have. Those still need the grounding gates and a judge in the eval. But numbers are where a
wrong answer costs a customer money, so that is where I put the deterministic check.

!!! warning "Shortcuts must not inherit stale evidence"
    Every early return skips retrieval, so the previous turn's offers were still sitting in the
    response. A refusal could ship with an unrelated offer card under it. Each turn now resets
    its evidence first, and refusals always carry none.

## Testing and results

The regression set is `eval/queries.json`: 225 cases across 20 categories, from offer lookups and
FAQ answers to prompt injection, gibberish, follow-up memory and hallucination checks. The runner
exits 0 only when every case passes and 1 otherwise, which is what lets it gate a build.

The numbers come from one run (2026-09-24, `phase5_rerun`, reported in
`eval/EVALUATION_REPORT.md`):

- **Retrieval only:** 151 of 172 checked cases, 87.8%.
- **Full pipeline:** 64 of 225, 28.4%.

That gap is the point of the report. Retrieval found the right FAQ in 21 of 24 checked
`faq_direct_answer` cases, while the full pipeline answered only 2 of 25 correctly. Prompt
injection passed 3 of 6 end to end, out of scope 5 of 11, greeting 1 of 8. The weak spots are
in answering and follow-up handling, not in finding the document. The suite gates per category;
categories below target are tracked as open work.

The newer pipeline has its own checks: 173 pytest tests and a share-weighted CS eval at 100% as of
the latest pass in `docs/STATE.md`. That eval has 20 cases, so it tells me the common support
flows don't regress. It does not tell me the long tail is solved.

Two caveats. The full-pipeline numbers came from a local 3B model; a stronger generator changes
them, which is why the gates sit in front of the model and not inside it. And the keyword-based
pass checks can be fooled by a paraphrase, so a judge with frozen metric definitions now does the
labeling, and human calibration labels are still pending.

## What I'd do next

- Fix the categories where the full pipeline trails retrieval, starting with FAQ direct answers
  and follow-up memory, since retrieval already finds the right document there.
- Add an expiry check to the evidence gate. The project summary lists expired offers leaking
  through it as a known weakness.
- Build out the guarded SQL fallback from the plan only after it passes a security review, and
  keep personal queries on fixed templates until then.
- Turn traced production turns into eval cases, so the suite grows from real failures and not
  from what I think customers ask.

[Get in touch](../index.html#contact).
