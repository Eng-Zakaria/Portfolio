---
title: "My graduation-project Arabic QA app, and what production taught me after"
date: 2026-11-08
summary: "A look at the Django web app my team built around a hosted hadith question-answering model at Helwan University, what it did and didn't do, and which of its gaps I closed later in production RAG at Waffarha."
tags: [RAG, Arabic NLP, LLM]
draft: false
---

Academic work: this was my graduation project at Helwan University (BSc Computers and Artificial Intelligence, 2024), built by a six-person team under the supervision of Dr. Ensaf Hussein. Graded A+. The repository I'm writing about is the web application, a Django site called Estidlal that lets a signed-in user ask questions about hadith and keeps their history. The question-answering model itself ran in a separate Hugging Face Space, and its code is not in this repository, so I'll describe it only from the outside.

## The problem

Searching hadith collections usually means knowing which book to open and which words to search for. The site's own copy put the goal plainly: help students and researchers search religious sources using "a question, phrase, or word". The landing page describes the intended scope as the Quran and hadith from the six major collections.

My part of the problem was narrower than that sentence. Given a question-answering model hosted by teammate Mohamed Maher, build a site where people can sign up, ask a question, see the answer, and find old answers again.

## Architecture

```text
 Browser
   |  home.html: sign up / sign in      chat.html: question form (POST)
   v
 Django 5 views (home/views.py)
   |-- home, loginUser, logout ---------> SQLite: Login (name, email, hashed password)
   |-- answer --+---------------------->  SQLite: Answer (login FK, question_text,
   |            |                                  answer_text, created_at)
   |            +--> gradio_client.Client("Mohamed-Maher/Hadith-QA-System")
   |                   .predict(question=..., api_name="/predict")
   |                   -> Hugging Face Space (model, data and retrieval live here,
   |                      not in this repo)
   |-- search_history -----------------> SQLite: icontains on question or answer

 Separate widget on the landing page (client side only):
   "New Hadith" button -> api.hadith.gading.dev/books/bukhari?range=300-500
                          -> shows the Arabic text of a random result
```

The whole app is three dependencies (`Django`, `gradio-client`, `Pillow`), five routes, two models and four migrations. The core of the answer path is short enough to quote:

```python
client = Client("Mohamed-Maher/Hadith-QA-System")
result = client.predict(
    question=question_text,
    api_name="/predict"
)
answer = Answer.objects.create(
    question_text=question_text,
    answer_text=result,
    login=user
)
```

The answer comes back as one string. The app stores it and renders it under the question. It doesn't receive the retrieved passages, a source list or a score, so it can't show hadith numbers, collection names or grading separately from the answer text. Whatever references the user saw were whatever the model put in that string.

The random-hadith widget is separate from the QA path. It pulls a range of Sahih al-Bukhari entries from a public API and displays the Arabic text of one of them, without showing the collection name or hadith number on screen.

## Decisions and trade-offs

### Calling a hosted model through `gradio_client`

The team split along a clean line: the model side published a Gradio Space, and the web side called it by name. That let the two halves work in parallel, kept the Django app tiny, and meant nobody had to deploy a model next to the website.

The cost was visibility. From the web app, the model was a black box that took a question and returned text. There was no way to tell whether a bad answer came from retrieval or generation, because the app never saw what was retrieved. The call is also synchronous, creates a new client on every request and sets no timeout, so a slow Space holds the request open for as long as the Space takes.

Failures had a specific shape. Any exception is shown to the user as a message (`Error getting response: ...`), and the app still saves a row with a canned apology as the answer. That keeps the user's question in history, which I liked at the time. It also means an outage turns into stored "answers" that are not answers.

### Keeping history in the database and searching it with `icontains`

Every question and answer is saved per user, newest first, and the search box filters with Django's `icontains` on either field. That gave users a working history and search with almost no code.

The trade-off is that this is plain substring matching. It does no Arabic normalization: a search with diacritics won't match text without them, and different spellings of alef or ta marbuta are different strings. For an Arabic app, that's the part of search that matters most, and it isn't there.

### Server-rendered forms instead of an API

The chat page is a normal HTML form that POSTs to `/home/answer/` and gets a full page back with the user's whole history. There's no JSON API, no streaming and no conversation state passed to the model; each question is sent on its own.

This was the right size for a graduation project: easy to build, easy to demo, and Django's CSRF protection works without extra effort. The cost is that the user waits on a blank page while the model runs, and follow-up questions like "and what about the second one?" have no context to lean on.

Auth sits in between. The `Login` model is custom rather than Django's `User`, but it does hash passwords with Django's `make_password` and `check_password`. Sessions are handled by hand by putting the email in `request.session`. It works, but it duplicates what `django.contrib.auth` already does.

## Results

What I can verify from the repository:

| Item | What the code shows |
|---|---|
| Question answering | One call per question to a hosted Space; answer stored and rendered as text |
| Sources and grading | Not returned separately by the call, so not shown separately by the app |
| History | Per-user, newest first, substring search |
| Failure handling | Error message to the user plus a stored placeholder answer |
| Tests | `home/tests.py` is the Django default with no tests |
| Evaluation | None in this repository |
| Grade | Graded A+ |

I don't have a recorded accuracy figure for the question-answering model. If the team evaluated it, that work lived with the Space, not here. The virtualenv in the repo was created in April 2024, which fits the spring-2024 delivery; the code was pushed to GitHub in March 2026.

## What production taught me after

Two years later I built a bilingual Arabic and English support assistant at Waffarha. Looking back at this app, almost every gap that hurt there was already visible here.

**Measure retrieval and answers separately.** Here, the web app couldn't see retrieval at all. At Waffarha, the same run scored retrieval at 151 of 172 checked cases (87.8%) and the full pipeline at 64 of 225 (28.4%). Without both numbers I would have fixed the wrong half. I wrote that up in [Retrieval hit rate isn't answer accuracy](../articles/bilingual-rag-retrieval-hit-rate.html).

**Have an eval suite before claiming quality.** This repo has no tests and no evaluation set. The production assistant has a 225-case suite across 20 categories, including prompt injection, out-of-scope questions and checks for merchants that don't exist, and it gates per category.

**Don't send everything to the model.** Here, every non-empty question went straight to the Space. In production, greetings, gibberish, injection attempts, unknown merchants and out-of-scope questions are answered or refused by plain rules before any model call, with refusal floors on retrieval similarity. That's in [Deterministic gates before the LLM](../articles/deterministic-gates-before-llm.html).

**Fail to a safe answer, not a stored apology.** Here, an exception became a fake answer in the user's history. In production, a fact check compares prices, dates and IDs in the draft against the sources, retries once with a critique, and otherwise falls back to a minimal factual reply and a handoff offer.

**Carry evidence with the answer.** For religious content this matters even more than for deals. A hadith answer is only useful if the reader can see which collection and number it came from. In the production pipeline each turn carries its own evidence, reset at the start of the turn, and refusals carry none, so an answer never ships with someone else's sources. This app never had a channel for evidence at all.

## What I'd do next

If I picked this project up again, in order:

1. Change the model call to return the answer plus its retrieved passages and their references (collection, book, number, and any grading the source data carries), and render those under the answer instead of relying on the answer text.
2. Write a small evaluation set of real questions with expected hadith references, and score retrieval and answers separately.
3. Add a timeout and keep failed calls out of history, or mark them clearly as errors.
4. Normalize Arabic for history search: strip diacritics and unify alef and ta marbuta forms on both the query and the stored text.
5. Replace the custom login with `django.contrib.auth` and add a few view tests.

What it taught me most was where I needed visibility inside the system.

## Links

- [Case page](../projects/hadith-chat-app.html)
- [GitHub: Eng-Zakaria/Hadith_Chat_App](https://github.com/Eng-Zakaria/Hadith_Chat_App)
