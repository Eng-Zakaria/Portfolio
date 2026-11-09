---
title: "From 160,944 support chats to a redacted 117,915-chat training set: what zero leaks takes"
date: 2026-11-08
summary: "How I turned real Waffarha support conversations into PII-free analytics and a redacted multi-turn SFT dataset of 117,915 resolved chats, and why the first redaction pass was not good enough."
tags: [Data Privacy, LLM Fine-Tuning, Data Engineering]
draft: false
---

Evidence label: this is production data at Waffarha. The input was 160,944 real customer-support chats from Egypt and Saudi Arabia, covering March to October 2026. Every chat had a transcript and an AI-generated set of labels. I wanted two things from it: analytics I could use to fix the support chatbot, and a training set for a small Arabic model. Both had to contain no personal data.

This post is about the second part, the boring one: getting redaction to an audited zero, and what that number does and does not mean.

## The problem

Support chats are where customers paste everything. Phone numbers so the agent can find the account. Emails. Links to screenshots. Order and voucher codes. Social handles. Agents sign their name on each turn.

The labels were useful on their own. About 124k of the chats were from Egypt and 27k from Saudi Arabia, and 96% were in Arabic. Around 5.4% were written in Latin script, which in Egypt usually means Arabizi. All of that matters for a model that has to understand Egyptian dialect.

But a training set built from raw transcripts would teach a model to emit real phone numbers. A 4B model will happily reproduce a pattern it has seen thousands of times, and I had already seen the local model hallucinate phone numbers and emails in an earlier review. So the bar was not "mostly redacted". It was "a second, independent scan finds nothing".

## The pipeline

There are two separate paths, and keeping them separate was the first decision.

### Path 1: aggregates for analytics

`analyze_cs_chats.py` and `cluster_other.py` read the chats and write only aggregate counts and shares. No message text leaves the script. For the clustering of the "Other" bucket, the output is label-grouped counts plus the top non-digit tokens, so numbers never show up even as a frequent token.

That was enough to add new intents to the chatbot (refund status, OTP issues, account updates, app issues) and to weight the routing eval by real traffic shares.

### Path 2: a redacted multi-turn SFT set

`build_sft_dataset.py` does four things:

1. Keeps only chats marked resolved. That dropped 43,029 chats and kept 117,915.
2. Segments each transcript into user and assistant turns using the speaker tags, and drops the agent name from the tag.
3. Runs a redaction function over every message, customer and agent alike.
4. Writes JSONL with `messages` plus a small `meta` block (issue type, contact type, use case, month), and a stats file with counts only.

The result is 3,181,807 turns across 117,915 conversations, about 27 turns each on average.

Here is the shape of the redaction step, simplified. Order matters: emails and URLs go first so their digits are not half-eaten by the number rules.

```python
import re

EMAIL   = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL     = re.compile(r"https?://\S+|www\.\S+")
HANDLE  = re.compile(r"@[\w.]+")
PHONE   = re.compile(r"(\+?20\s?1\d{9}|01\d{9})")
LONGNUM = re.compile(r"\d{6,}")
GROUPED = re.compile(r"(?:\d[\s.\-()]?){7,}")   # spaced or dashed digit groups

def redact(text: str) -> str:
    for rx, token in [(EMAIL, "[EMAIL]"), (URL, "[URL]"), (HANDLE, "[HANDLE]"),
                      (PHONE, "[PHONE]"), (LONGNUM, "[NUM]"), (GROUPED, "[NUM]")]:
        text = rx.sub(token, text)
    return re.sub(r"\+20\s?", "", text)          # drop bare country-code remnants
```

The real builder also covers IP addresses and a few internal code formats, and counts each substitution. The counts from the final run:

| Placeholder | Replacements |
|---|---|
| `[PHONE]` | 69,223 |
| `[NUM]` | 45,159 |
| `[URL]` | 14,407 |
| `[EMAIL]` | 2,764 |
| `[HANDLE]` | 246 |
| `[CODE]` | 10 |

## Decision 1: aggregates for analysis, transcripts only for training

I could have done the analysis by sampling raw chats and reading them. It would have been faster to get a feel for the data. I chose not to: the analytics path only ever produces counts and shares, and the plan document lists "no raw chats in repo" and "no PII" as things I am explicitly not doing.

The trade-off is real. Aggregates hide nuance. The labels are a model's reading of each chat, not human review, so I treat the shares as directional. And when the "Other" bucket needed breaking down, I could only see label groups and frequent tokens, not why a customer was confused. That is slower. But the analytics path cannot leak, by construction, and that let me move fast on the chatbot fixes without a review step on every run.

The training path is the only place where transcript text survives, and it survives only after redaction.

## Decision 2: a separate, stricter audit instead of trusting the builder

The builder's own counters only tell you what it replaced. They say nothing about what it missed. So I wrote `audit_sft.py` as an independent second pass with its own patterns, stricter than the builder's. It prints only aggregate counts, never message text.

It checks every message for 8 patterns:

- email addresses
- IPv4 addresses
- Egyptian mobile numbers
- a literal `+20`
- runs of six or more Arabic-Indic digits
- runs of eight or more Latin digits
- `@` mentions not inside a placeholder
- URLs (`http://`, `https://`, `www.`)

The first audit did not pass. It caught phone numbers written in spaced or dashed groups, which the contiguous phone pattern never matched. It caught URLs the first URL rule left behind, and `@` handles. Builder v2 added the grouped-digit rule, a full URL rule, a handle rule, and stripping of the bare `+20` that was left in front of a `[NUM]`.

After v2 the audit reported an empty leak count, `leak_msgs={}`, across all 117,915 lines.

!!! warning "Zero leaks means zero matches on 8 patterns"
    The audit proves that none of those 8 patterns appear. It does not prove the data is free of personal information. A customer's name typed in free text, an address, or a number spelled out in Arabic words would pass every regex. That is why training on this set is still deferred until a human has looked at samples.

## Decision 3: recall over readability

The grouped-digit rule is aggressive on purpose. Any seven or more digits, in any spacing, become `[NUM]`. That will also eat prices written with spaces, some dates, and amounts. I accepted that. Seven-plus-digit sequences carry almost no value for teaching a support model how to talk, and a missed phone number is a much worse failure than a slightly less specific training turn.

The cost shows up in the data: 45,159 `[NUM]` replacements, some of which were not personal at all. The model will learn that customers sometimes say `[NUM]`. I think that is the right price. The opposite choice, tuning rules to keep more numbers, means every new format a customer invents is a potential leak.

## Results, with caveats

What is done:

- 160,944 chats analysed into PII-free aggregates, which drove new chatbot intents and a traffic-weighted eval.
- A redacted multi-turn dataset of 117,915 resolved chats, with zero matches on all 8 audit patterns.

What is not done, and I want to be direct about it:

- **No model has been trained on the 117,915-chat set yet.** The project state says training is deferred until a human checks samples.
- The model that runs inside Chatwoot today is a different, smaller effort. It is a LoRA fine-tune of `Qwen3-4B-Instruct-2507`, trained on FAQ-grounded conversations (the FAQ knowledge base, 27 evaluation cases, and customer questions matched to FAQs by embeddings), merged into the base weights and served through Ollama as `waffarha-support:4b`. The merge is needed because Ollama 0.40 removed LoRA adapter support. It trained on a 4 GB GTX 1650 Ti, in float16 because bfloat16 needs compute capability 8.0 and the card is 7.5.
- The default model in the main chatbot pipeline is a separate, pre-installed `nile-chat-4b-waffarha`. It has no tool template and rejects tool calls, so it cannot run the Chatwoot agent path.
- The routing eval reads 100%, but on 19 cases, later 20. That is a regression check, not a quality measurement.

## What I'd do next

1. **Human sample review.** Pull a random, stratified sample by issue type and read it for what regex cannot catch: names, addresses, numbers written as words.
2. **Add a name and address pass.** A dictionary of common first names plus an NER model on the customer side, scored by the same audit approach: a separate script, aggregate counts only.
3. **Make the audit a gate.** Run `audit_sft.py` after every rebuild and fail the build on any non-empty leak count, the same way the mojibake check has to report zero before a training run.
4. **Then train, and evaluate on more than 20 cases.** A model trained on 117,915 real resolved chats should be compared against the FAQ-only model on a larger held-out set before it goes anywhere near Chatwoot.

The lesson I keep coming back to: the builder's counters felt like proof, and they were not. The independent audit found three leak types on its first run. Without it, "redacted" would have been a claim, not a measurement.

[Get in touch](../index.html#contact).
