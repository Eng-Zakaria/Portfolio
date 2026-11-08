# Writing articles on the portfolio

## The 3-step flow

1. Write a Markdown file:
   - `articles/_drafts/my-post-title.md` while you're still working on it. This folder is git-ignored,
     so it stays on your PC and never goes public.
   - Move it to `articles/posts/my-post-title.md` when it's ready to publish.
2. Build:
   ```bash
   python scripts/build_articles.py            # published posts only
   python scripts/build_articles.py --drafts   # preview drafts locally too
   ```
3. Run a normal build (without `--drafts`), then commit and push. GitHub Pages publishes within a minute.

The file name becomes the URL: `posts/fail-open-nightly-recommender.md` turns into
`/articles/fail-open-nightly-recommender.html`. Use lowercase words joined by dashes.

## Front matter (top of every file)

```yaml
---
title: "Your headline"
date: 2026-11-15
summary: "One or two sentences. Shown on cards, in the RSS feed, and in Google results."
tags: [Airflow, Data Quality]
medium: https://eng-zakaria.medium.com/...   # optional: adds an "Also on Medium" button
cover: images/my-post-title/cover.png        # optional: put images in articles/images/<slug>/
draft: true                                  # optional: keeps a post in posts/ unpublished
---
```

## What you can use in the body

- `## Headings` and `### Subheadings` (3 or more of them add an "On this page" table of contents)
- Code blocks with a language for highlighting: ```` ```python ````, ```` ```sql ````, ```` ```yaml ````
- Tables, footnotes `[^1]`, images `![alt text](images/my-post-title/chart.png)`
- Callouts:
  ```
  !!! note "Title"
      Indented text inside the box. Use note, tip, or warning.
  ```

## What the build gives you automatically

Each post gets:
- reading time and a reading progress bar
- a table of contents and copy buttons on code blocks
- share buttons for LinkedIn, X, WhatsApp, copy link, and the phone's share sheet
- links to the newer and older posts
- SEO tags (canonical URL, `BlogPosting` structured data)

The build also updates:
- the article list, with topic filters
- `feed.xml` (RSS) and `sitemap.xml`
- the 3 latest posts on the home page's Writing section

## Cross-posting to Medium

Publish here first. Then on Medium use **Import a story**, paste this post's URL, and Medium will set
the canonical link back to your site. Add the Medium URL as `medium:` in the front matter and rebuild.
