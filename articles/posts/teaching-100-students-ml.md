---
title: "What teaching 100+ students ML taught me about explaining data"
date: 2026-11-09
summary: "A reflection on my months as an AI Instructor at iSchool, where I taught AI and machine learning to 100+ students, and how the habits from that room show up in how I evaluate and explain data work today."
tags: [Career, Teaching, Machine Learning]
draft: false
sources:
  - CV/profile/MOHAMMED_ZAKARIA_PROFILE.md
  - CV/profile/mohamed_zakaria_resume_data.yml
  - CV/templates/Main_Resume_Template.tex
  - Profile/Portfolio/index.html
  - Profile/Portfolio/articles/posts/bilingual-rag-retrieval-hit-rate.md
  - Profile/Portfolio/articles/posts/redacting-160k-support-chats.md
  - Profile/Portfolio/articles/posts/estates-lakehouse-zero-loss.md
  - Profile/Portfolio/articles/posts/one-power-bi-model.md
  - Profile/Portfolio/articles/posts/deterministic-gates-before-llm.md
---

This is a career reflection. The facts come from my CV and the project write-ups linked below; the rest is my own view of what teaching does to the way you explain technical work. From June to November 2024, straight after finishing my degree in Computers and Artificial Intelligence at Helwan University, I worked as an AI Instructor at iSchool in Cairo. I taught AI and machine learning to more than 100 students, and they built their own AI and machine-learning projects. I have since moved into data engineering, and the habits from that job show up in how I evaluate and explain my work.

## The role, in facts

| Item | What the record says |
|---|---|
| Role | AI Instructor, iSchool, Cairo |
| Dates | 06/2024 to 11/2024 |
| Audience | 100+ students, taught AI and machine learning |
| Student work | Hands-on AI and machine-learning projects, with sessions on model evaluation |
| Outcome | 90% project completion, the cohort's highest finish rate |
| Delivery | 100% of curriculum modules delivered and documented on schedule |

And here is where it sits in the rest of my path:

```text
2020-09 ── 2024-05  BSc Computers and AI, Helwan University (graduation project A+)
2024-06 ── 2024-11  AI Instructor, iSchool            <- this article
2025-01 ── 2026-01  Data Engineer, Nexlify (10+ clinic warehouse, Power BI)
2026-01 ── now      Freelance Data and AI Engineer
2026-04 ── 2026-07  Big Data Engineering Intern, NTI
2026-07 ── now      Data Engineer, Waffarha (bilingual RAG, support data)
```

Teaching came between finishing a degree and starting production data work. That order matters to me. I learned to explain machine learning before I had to defend my own numbers to a team that depended on them.

## Three mistakes that kept coming up

Because every student built a project, I saw the same misunderstandings come up again and again, across different groups. Almost all of them were about evaluation, not training. These are the three I spent the most time on.

**Judging a model by accuracy on imbalanced data.** A project would report a high accuracy on a dataset where most rows belonged to one class. A model that always predicts the majority class gets the same score and has learned nothing. The way I explained it: before you look at your score, work out the score of the laziest possible model. If you can't beat "always say no", the number isn't telling you anything yet. Then look at the confusion matrix and the recall for each class, because that is where the rare class shows up.

**Testing on data the model has already seen.** Some projects evaluated on the training data, or split the data only after a step like scaling or filling missing values had already used every row. I explained it as an exam: if you see the exact questions beforehand, a high mark shows you memorised them, not that you understand the subject. The test set stays locked away until the end, and anything you fit, preprocessing included, is fitted on the training data only.

**Overfitting: a great training score and a poor test score.** A model with near-perfect training results looked like a success until it met the test set. I described it as memorising the noise instead of learning the pattern, and asked students to always print both scores side by side. A big gap is a signal to simplify the model, get more data or regularise, not a result to celebrate.

All three come down to one rule I repeated in every session: a score always has a denominator, and the test set has to look like the real world. The easiest way to check whether you understand that is to explain it to someone who has no reason to trust you yet. Students give you that test every session.

## The same habit in my data work now

The clearest example is the retrieval evaluation I ran for Waffarha's Arabic/English customer-service assistant. In the September 2026 run, retrieval found the expected document in 151 of 172 checked cases, an 87.8% hit rate. In the same run, on the same index, the full pipeline passed 64 of 225 cases. I wrote a whole article about why those two numbers have to be reported together: [Retrieval hit rate isn't answer accuracy](../articles/bilingual-rag-retrieval-hit-rate.html).

That article is really a model-evaluation lesson with production data in it. The 172 and the 225 are different denominators. The 172 only counts cases that have an expected document; greetings and prompt-injection attempts have none. If I had published 87.8% on its own, I would have broken the first rule I used to teach.

The pattern repeats across my other write-ups:

| Claim that sounds complete | What I say next to it | Article |
|---|---|---|
| 87.8% retrieval hit rate | 64/225 end-to-end in the same run; retrieval is a component test | [Bilingual RAG](../articles/bilingual-rag-retrieval-hit-rate.html) |
| Zero leaks across 117,915 chats | Zero matches on 8 patterns, not proof there is no personal data; training deferred until human review | [Redacting 160,944 chats](../articles/redacting-160k-support-chats.html) |
| 8/8 sources, zero loss | The acceptance run was 8/8; a later file on disk shows 6/8, and both failures were in the check, not lost data | [Estates lakehouse](../articles/estates-lakehouse-zero-loss.html) |
| A 225-case eval suite | Which categories the deterministic gates handle well, and which they don't | [Deterministic gates](../articles/deterministic-gates-before-llm.html) |

None of this is about being modest. A number with its limits attached is more useful, because the reader knows how far to trust it and what to measure next. In a classroom, an overclaim gets caught quickly and costs you the room's trust. A team reading your dashboard works the same way, only slower.

## Writing for people who won't read the code

Most people who use data work never open the repository. On my portfolio I describe one of my strengths as making complex systems obvious to non-engineers, and teaching is where that started. In practice it comes down to a few habits:

1. **Start with the question, not the tool.** "Did the assistant find the right document?" comes before "BGE-M3 on Qdrant with reciprocal rank fusion."
2. **Use one concrete case before the summary.** One category's numbers (retrieval passed 33 of 34 checked category-browsing cases; end-to-end passed 16 of 39) explains the gap better than a paragraph.
3. **Put the check where the reader already looks.** In my Power BI work that means a data-quality page inside the report, with a reconciliation measure and expected values for each KPI card. I describe it in [One BI model, many sites](../articles/one-power-bi-model.html).
4. **Say what the number does not mean.** One sentence of caveat is usually enough, and it saves a meeting later.

These are the same moves I used in a lab session. The audience changed from students to support teams and managers, but what makes an explanation work did not.

## What I would tell someone starting out

If you are early in a data or ML career and get the chance to teach, even part-time, take it.

- **Teaching is a test of your own understanding.** If you can't explain why a metric can mislead, you don't fully understand the metric yet.
- **Teach evaluation early and often.** Training a model gets the attention, but deciding whether it works is the skill you will use every week.
- **Write your material down.** Delivering every module documented and on schedule was part of the job, and it is the same discipline as keeping an evaluation report or a README current.
- **Treat questions as data.** The places where people get confused show you where your explanation is weak.

I still write most of my work as if a sharp student is going to ask "out of how many?" It is the cheapest check against overclaiming that I know.

[Get in touch](../index.html#contact).
