---
title: "Waffy: a support agent that can't go rogue"
date: 2026-11-08
summary: "How I built a prototype customer-service agent for Waffarha where the model never writes SQL, never chooses whose data it sees, and cannot move money: a hand-written loop over read-only ClickHouse, with dry-run actions and a safety eval gate."
tags: [AI Agents, Guardrails, Python]
draft: false
---

Evidence label: this is a working prototype I built at Waffarha, not the production assistant. It runs against a read-only ClickHouse database and a local 3B model. Refunds and purchases are dry-run only, and nothing it does touches a customer's money. The test and eval numbers below come from my own progress log, and the headline eval number is a routing-only dry run, not a live run.

## The problem: an agent with tools is an agent with permissions

Waffarha is an Egyptian deals and coupons platform. Most support questions are about data: prices, branches, coupon status, refunds. A model with tools over the database could answer most of them.

That is also the risk. With tools, every weakness of the model becomes a weakness of the system. It can pass the wrong customer id, follow an instruction hidden in an offer description, or state a price it never looked up. If it can write, it can refund the wrong coupon.

So I started from one question: what is the model allowed to decide? My answer was "as little as possible". The model phrases answers. The code decides who the customer is, what can be queried, and whether anything happens.

## The design

Waffy is a FastAPI service with a small web chat UI. A turn goes through three steps in a hand-written loop, with no agent framework:

1. **Route.** A deterministic router picks the tool and its arguments from the customer's message.
2. **Act.** The tool runs a fixed, parameterized query against read-only ClickHouse.
3. **Answer.** The model phrases the answer from the tool result. If the router finds nothing to route, such as a greeting, the model gets the tools for that caller and runs a short loop with a hard step limit.

The answer streams back over Server-Sent Events as `status`, `token`, `replace` and `done` events. `replace` lets the server take back a streamed answer.

Every tool goes through one registry. Here is how the guards line up:

| Tool or layer | Who can use it | Guard |
|---|---|---|
| Offer search, offer details, nearby offers, recommendations, FAQ, handoff | Guests and customers | Fixed SQL templates; the model only supplies values |
| My coupons, coupon details, my refunds, order status | Signed-in customers only | Customer id comes from the server-side context, never from tool arguments |
| `request_refund`, `purchase_offer` | Signed-in customers only | Propose only; execution needs a separate confirmation turn handled by the loop |
| Action adapter | Server config | Only `ACTION_MODE=dry_run` exists; any other value fails at startup |
| ClickHouse client | Every query | Read-only user, `readonly=2` session, 10 s timeout, 200-row cap |
| Final answer | Every turn | Grounding check, then e-mail and mobile redaction |

The model never writes SQL. There are 14 query templates, and a strict renderer escapes every value through one function. It refuses a template with a missing parameter and refuses a parameter the template does not declare. Table and column names are hard-coded in the templates, so model output can change values but never the shape of a statement.

## Decision 1: identity lives in the context, not in the arguments

No tool takes a customer id. The HTTP request carries a demo login key. The server checks it against an allow-list (`DEMO_CUSTOMER_IDS`), and an unknown key gets a 403. The result goes into a `ToolContext` that every tool handler receives. The model never sees it as a parameter, so it cannot change it.

A simplified version of the pattern, in my own words:

```python
@dataclass
class ToolContext:
    customer_id: str | None   # set by the server, never by the model
    session_id: str | None

async def dispatch(name, args, ctx, timeout):
    tool = TOOLS_BY_NAME.get(name)
    if tool is None:
        return fail(f"Unknown tool: {name}")
    if tool.customer_only and not ctx.is_authenticated:
        return fail("This tool needs a signed-in customer.")
    try:
        return await asyncio.wait_for(tool.handler(ctx, args), timeout)
    except Exception as exc:
        return fail(f"{name} failed ({type(exc).__name__}). Say you could not confirm it.")
```

Customer tools are filtered out of the tool list for guests, and `dispatch` checks again in case the model names one anyway. Tool errors come back to the model as data, not as a stack trace.

The trade-off is that Waffy cannot help with anything outside the signed-in customer's own scope. For a customer-facing assistant that is the right default. A live test checks that coupon details come back empty for a coupon the customer does not own.

## Decision 2: refunds and purchases are proposals, and the loop confirms

`request_refund` and `purchase_offer` never execute anything. They call `propose` on the action adapter. The adapter reads the database, applies versioned eligibility rules, and stores a proposal with its rule version, inputs, facts and decision.

The customer has to answer in a separate turn. Before any routing, the loop checks for a pending proposal for the same customer and the same session. A strict classifier reads the message. A clear yes confirms, a clear no cancels, and anything else supersedes the proposal, so a stale "yes" several turns later cannot run an old request. Only the loop passes `confirmed=True`. The model has no path to it.

Even a confirmed action only marks the proposal `confirmed` and returns a summary that says plainly that nothing was executed in Waffarha's systems. The adapter factory raises at startup for any mode other than dry run. A config typo should never quietly change what the system does with money.

The trade-off is that this cannot ship as a refund tool yet. Going live needs a write API, the refund policy as versioned data, a refund state machine, a payout method and a confirmation channel tied to the customer's account.

## Decision 3: a router picks the tool, and some answers skip the model

The 3B local model (`qwen2.5:3b-instruct`) picked the wrong tool or answered from memory often enough that I moved tool selection into a deterministic router.

For factual lists I went further. Offer search, offer details, recommendations and the customer's coupons stream the tool's own ready-made message word for word. The small model had called a used coupon "not used" and drifted into a different Arabic dialect.

Two output guards run on whatever text is left. The grounding check blocks an answer that states a price, date, availability or coupon status when no tool ran that turn. The loop retries once with a nudge to call a tool, and then falls back to "I can't confirm that". Redaction removes e-mail addresses, and for guests mobile numbers, from the final answer before it is stored and sent as the closing `done` event.

!!! warning "Where redaction actually happens"
    Redaction runs on the model's output, not on the data going in. Tool results reach the model unredacted, and streamed tokens go out before the redacted `done` text replaces them. Moving redaction to the tool-result boundary is on my list.

The trade-off of the router is coverage. It only knows the intents I wrote rules for, in Egyptian Arabic, MSA, English and Franco-Arabic. Anything else falls through to the free loop, where the model's weaknesses come back.

## Testing and results, with caveats

There are two layers of checks.

**Tests.** pytest covers the SQL renderer, router, guards, loop, actions and tools, plus live read-only ClickHouse tests that skip when the database is down. The latest entry in my progress log records 212 tests passing, with ruff clean.

**Evals.** `evals/cases.yaml` has 53 cases across Egyptian Arabic, MSA, Franco, English, mixed language, spelling variants, negation and actions. Ten are critical safety cases, such as another customer's coupons, prompt injection inside an offer description, requests for SQL, and prices without a tool. The runner prints the pass rate per category and exits non-zero on any critical failure, so it can gate a merge.

The recorded results are 53/53 on the dry run and 10/10 on the critical cases. Be clear about what each means:

- The **dry run** checks routing only. No model is called and the text checks are skipped. It tells me the router sends each message to the right tool, not that the answers are good.
- The **critical 10/10** was run live against ClickHouse and the local model. That is the stronger number, but it is ten cases.
- I have not recorded a full live run of all 53 cases. On a CPU-only box a live case takes roughly 30-60 s, so I ran subsets.

Failure paths were checked live too: with the model unreachable the agent answered from the help centre in 5.4 s, and with the database down `/health` returned 503 and the chat still answered politely.

## What I'd do next

- **Move redaction to the tool-result boundary**, so the model never sees partner phones or other fields it does not need, and redact the token stream rather than only the final text.
- **Run the full eval live on a hosted model.** The 3B local model is the main limit on latency and answer quality. I would rerun the critical subset first, then all 53 cases, and record live pass rates separately from the dry run.
- **Shared state.** Sessions, proposals and the rate limiter are single-process; more workers need Redis or Postgres.
- **Live actions, only with the missing pieces.** A write API, the refund policy as data and an account-tied confirmation channel come first.

The lesson for me: keep identity, SQL and execution in plain code, where I can test them, and let the model phrase.

[Get in touch](../index.html#contact).
