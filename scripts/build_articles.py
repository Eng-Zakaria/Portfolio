#!/usr/bin/env python3
"""Build the portfolio's native articles from Markdown.

Write posts as Markdown in  articles/posts/<slug>.md  (published)
or keep unfinished work in  articles/_drafts/<slug>.md  (git-ignored, never published).

    python scripts/build_articles.py            # build published posts
    python scripts/build_articles.py --drafts   # also render drafts, for local preview only

Outputs (all static, served as-is by GitHub Pages):
    articles/<slug>.html     one page per post
    articles/index.html      the article list
    feed.xml                 RSS 2.0 feed
    sitemap.xml, robots.txt  for search engines
    css/article-code.css     syntax-highlighting theme (light + dark)
    index.html               the 3 latest posts, between the native-articles markers

Front matter (YAML between --- lines at the top of the file):
    title:    required
    date:     required, YYYY-MM-DD
    summary:  required, one or two sentences (used on cards, in the feed, and for SEO)
    tags:     optional list, e.g. [Airflow, Data Quality]
    draft:    optional, true keeps the post unpublished even inside posts/
    cover:    optional image path relative to articles/, e.g. images/my-post/cover.png
    medium:   optional URL of the same post on Medium ("Also on Medium" link)
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import math
import re
import sys
from email.utils import format_datetime
from pathlib import Path

import markdown
import yaml
from pygments.formatters import HtmlFormatter

ROOT = Path(__file__).resolve().parent.parent
ARTICLES = ROOT / "articles"
POSTS = ARTICLES / "posts"
DRAFTS = ARTICLES / "_drafts"
MANIFEST = ARTICLES / ".generated.json"
SITE = "https://eng-zakaria.github.io/Portfolio"
AUTHOR = "Mohammed Zakaria"
VERSION = "20261108f"  # bump to bust caches after CSS/JS changes
HOME_START = "<!-- native-articles:start -->"
HOME_END = "<!-- native-articles:end -->"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
WORDS_PER_MIN = 220


class PostError(Exception):
    pass


# ── parsing ──────────────────────────────────────────────────────────────
def read_post(path: Path, is_draft_dir: bool) -> dict:
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.S)
    if not m:
        raise PostError(f"{path.name}: missing front matter (--- ... --- at the top)")
    meta = yaml.safe_load(m.group(1)) or {}
    body = m.group(2)
    slug = path.stem
    if not SLUG_RE.match(slug):
        raise PostError(f"{path.name}: file name must be lowercase-words-with-dashes")
    for key in ("title", "date", "summary"):
        if not meta.get(key):
            raise PostError(f"{path.name}: front matter needs '{key}'")
    date = meta["date"]
    if isinstance(date, str):
        try:
            date = dt.date.fromisoformat(date)
        except ValueError as e:
            raise PostError(f"{path.name}: date must be YYYY-MM-DD") from e
    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]

    md = markdown.Markdown(
        extensions=["extra", "codehilite", "toc", "sane_lists", "smarty", "admonition"],
        extension_configs={
            "codehilite": {"css_class": "hl", "guess_lang": False},
            "toc": {"permalink": "#", "permalink_class": "h-anchor", "toc_depth": "2-3"},
        },
        output_format="html5",
    )
    content = md.convert(body)
    content = re.sub(r"<img (?![^>]*loading=)", '<img loading="lazy" ', content)
    content = re.sub(r"<table>", '<div class="table-wrap"><table>', content)
    content = content.replace("</table>", "</table></div>")
    words = len(re.findall(r"\w+", re.sub(r"<[^>]+>", " ", content)))
    headings = [t for t in md.toc_tokens]
    return {
        "slug": slug,
        "title": str(meta["title"]).strip(),
        "date": date,
        "summary": str(meta["summary"]).strip(),
        "tags": [str(t) for t in tags],
        "cover": meta.get("cover"),
        "medium": meta.get("medium"),
        "draft": bool(meta.get("draft")) or is_draft_dir,
        "html": content,
        "toc": md.toc if _count_headings(headings) >= 3 else "",
        "words": words,
        "minutes": max(1, math.ceil(words / WORDS_PER_MIN)),
        "source": path.relative_to(ROOT).as_posix(),
    }


def _count_headings(tokens) -> int:
    return sum(1 + _count_headings(t.get("children", [])) for t in tokens)


def nice_date(d: dt.date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


e = html.escape


# ── templates ────────────────────────────────────────────────────────────
def head(title: str, desc: str, canonical: str, prefix: str, og_type: str = "website",
         extra: str = "", image: str | None = None) -> str:
    img = image or f"{SITE}/assets/Profile.png"
    return f"""<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <meta name="author" content="{AUTHOR}">
  <meta name="theme-color" content="#111214">
  <link rel="canonical" href="{canonical}">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:type" content="{og_type}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{img}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="alternate" type="application/rss+xml" title="{AUTHOR} — Articles" href="{SITE}/feed.xml">
  <script src="{prefix}js/theme-init.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="icon" type="image/svg+xml" href="{prefix}assets/favicon.svg">
  <link rel="stylesheet" href="{prefix}css/portfolio-themes.css">
  <link rel="stylesheet" href="{prefix}css/hood-portfolio.css?v={VERSION}">
  <link rel="stylesheet" href="{prefix}css/article.css?v={VERSION}">
  <link rel="stylesheet" href="{prefix}css/article-code.css?v={VERSION}">
{extra}  <script defer src="{prefix}js/main.js?v={VERSION}"></script>
  <script defer src="{prefix}js/theme-controls.js"></script>
  <script defer src="{prefix}js/article.js?v={VERSION}"></script>
</head>
"""


def header(prefix: str) -> str:
    home = f"{prefix}index.html"
    return f"""<body class="post-page">
  <div class="read-progress" aria-hidden="true"><i id="read-progress"></i></div>
  <header class="hood-header">
    <nav class="hood-nav" aria-label="Main navigation">
      <a class="hood-brand" href="{home}" aria-label="Mohammed Zakaria home">
        <span class="hood-brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 2 37 11.5v17L20 38 3 28.5v-17L20 2Z"/><path d="m12 26 8-15 8 15M15 21h10"/></svg></span>
        <span>MOHAMMED <b>ZAKARIA</b><small>DATA × AI ENGINEER</small></span>
      </a>
      <div class="hood-nav-actions">
        <a class="hood-nav-cta" href="{prefix}docs/Mohammed_Zakaria_Data_Engineer.pdf" target="_blank" rel="noopener">RÉSUMÉ <span>↗</span></a>
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Switch between light and dark mode"><span aria-hidden="true">*</span> <span>Light</span></button>
        <button class="hamburger" type="button" aria-label="Open navigation" aria-expanded="false"><span></span><span></span><span></span></button>
      </div>
      <ul class="nav-links" aria-label="Portfolio sections">
        <li><a href="{home}">Home</a></li>
        <li><a href="{prefix}articles/index.html">All articles</a></li>
        <li><a href="{home}#projects">Project street</a></li>
        <li><a href="{home}#experience">Experience</a></li>
        <li><a href="{home}#credentials">Credentials</a></li>
        <li><a href="{home}#contact">Contact</a></li>
      </ul>
    </nav>
  </header>
"""


def footer(prefix: str) -> str:
    home = f"{prefix}index.html"
    return f"""  <nav class="bottom-bar show" aria-label="Quick navigation">
    <a href="{home}"><i class="fa-solid fa-house" aria-hidden="true"></i><span>Home</span></a>
    <a href="{home}#projects"><i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>Work</span></a>
    <a href="{prefix}docs/Mohammed_Zakaria_Data_Engineer.pdf" class="bb-cta" target="_blank" rel="noopener"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i><span>Résumé</span></a>
    <a href="{prefix}articles/index.html" class="is-active" aria-current="page"><i class="fa-solid fa-pen-nib" aria-hidden="true"></i><span>Writing</span></a>
    <a href="{home}#contact"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Contact</span></a>
  </nav>
  <footer class="hood-footer">
    <a class="hood-brand" href="{home}"><span class="hood-brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path d="M20 2 37 11.5v17L20 38 3 28.5v-17L20 2Z"/><path d="m12 26 8-15 8 15M15 21h10"/></svg></span><span>MOHAMMED <b>ZAKARIA</b><small>DATA × AI ENGINEER</small></span></a>
    <span class="hood-footer-copy">© <span id="yr"></span> · Written in Cairo.</span>
    <div class="hood-footer-links"><a href="{SITE}/feed.xml">RSS feed</a><a href="#top">Back to top ↑</a></div>
  </footer>
  <div id="toast" role="status" aria-live="polite"></div>
</body>
</html>
"""


def tag_chips(tags) -> str:
    return "".join(f'<span class="post-tag">{e(t)}</span>' for t in tags)


def render_post(p: dict, prev: dict | None, nxt: dict | None) -> str:
    url = f"{SITE}/articles/{p['slug']}.html"
    cover_abs = f"{SITE}/articles/{p['cover']}" if p["cover"] else None
    ld = {
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": p["title"], "description": p["summary"],
        "datePublished": p["date"].isoformat(), "dateModified": p["date"].isoformat(),
        "author": {"@type": "Person", "name": AUTHOR, "url": SITE + "/"},
        "mainEntityOfPage": url, "wordCount": p["words"], "keywords": ", ".join(p["tags"]),
    }
    if cover_abs:
        ld["image"] = cover_abs
    extra = (f'  <meta property="article:published_time" content="{p["date"].isoformat()}">\n'
             f'  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n')
    if p["draft"]:
        extra += '  <meta name="robots" content="noindex">\n'
    out = [head(f"{p['title']} | {AUTHOR}", p["summary"], url, "../", "article", extra, cover_abs), header("../")]
    out.append('  <main class="post-main" id="top">\n')
    if p["draft"]:
        out.append('    <div class="post-draft-banner">Draft preview · not published</div>\n')
    out.append(f"""    <article class="post">
      <header class="post-head">
        <nav class="post-crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span><a href="index.html">Articles</a></nav>
        <div class="post-tags">{tag_chips(p['tags'])}</div>
        <h1>{e(p['title'])}</h1>
        <p class="post-lede">{e(p['summary'])}</p>
        <div class="post-meta">
          <span><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="{p['date'].isoformat()}">{nice_date(p['date'])}</time></span>
          <span><i class="fa-regular fa-clock" aria-hidden="true"></i>{p['minutes']} min read</span>
          <span><i class="fa-solid fa-user-pen" aria-hidden="true"></i>{AUTHOR}</span>
        </div>
      </header>
""")
    if p["cover"]:
        out.append(f'      <figure class="post-cover"><img src="{e(p["cover"])}" alt="" loading="eager"></figure>\n')
    out.append('      <div class="post-layout">\n')
    if p["toc"]:
        out.append(f'        <aside class="post-toc"><details open><summary>On this page</summary>{p["toc"]}</details></aside>\n')
    out.append(f'        <div class="post-body">\n{p["html"]}\n        </div>\n      </div>\n')
    medium = (f'<a class="post-btn" href="{e(p["medium"])}" target="_blank" rel="noopener noreferrer">'
              f'<i class="fa-brands fa-medium" aria-hidden="true"></i> Also on Medium</a>') if p["medium"] else ""
    out.append(f"""      <footer class="post-foot">
        <div class="post-share" data-url="{url}" data-title="{e(p['title'])}">
          <span class="post-share-label">Share</span>
          <a class="post-btn" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url={url}"><i class="fa-brands fa-linkedin" aria-hidden="true"></i> LinkedIn</a>
          <a class="post-btn" target="_blank" rel="noopener noreferrer" href="https://x.com/intent/post?url={url}"><i class="fa-brands fa-x-twitter" aria-hidden="true"></i> X</a>
          <a class="post-btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text={url}"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>
          <button class="post-btn" type="button" data-copy-link><i class="fa-solid fa-link" aria-hidden="true"></i> Copy link</button>
          {medium}
        </div>
        <div class="post-author">
          <img src="../assets/Profile.png" alt="" width="64" height="64" loading="lazy">
          <div><b>{AUTHOR}</b><span>Data Engineer at Waffarha, Cairo. Pipelines, warehouses, data quality, and the data layer behind production AI.</span>
          <a href="../index.html#contact">Get in touch ↗</a></div>
        </div>
        <nav class="post-pager" aria-label="More articles">
""")
    out.append(f'          <a class="post-pager-prev" href="{prev["slug"]}.html"><small>← Newer</small><b>{e(prev["title"])}</b></a>\n' if prev else '          <span></span>\n')
    out.append(f'          <a class="post-pager-next" href="{nxt["slug"]}.html"><small>Older →</small><b>{e(nxt["title"])}</b></a>\n' if nxt else '          <span></span>\n')
    out.append("        </nav>\n      </footer>\n    </article>\n  </main>\n")
    out.append(footer("../"))
    return "".join(out)


def card(p: dict, href: str, cls: str = "") -> str:
    return (f'<article class="post-card{cls}">'
            f'<div class="post-card-meta"><time datetime="{p["date"].isoformat()}">{nice_date(p["date"])}</time><span>{p["minutes"]} min read</span></div>'
            f'<h3><a href="{href}">{e(p["title"])}</a></h3>'
            f'<p>{e(p["summary"])}</p>'
            f'<div class="post-tags">{tag_chips(p["tags"][:3])}</div>'
            f'<a class="proj-link" href="{href}">Read article →</a></article>')


def render_index(posts: list[dict]) -> str:
    url = f"{SITE}/articles/"
    desc = "Practical, production-tested writing on data engineering, data quality, and the data layer behind AI."
    out = [head(f"Articles | {AUTHOR}", desc, url, "../"), header("../")]
    out.append(f"""  <main class="post-main" id="top">
    <section class="posts-hero">
      <nav class="post-crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a><span>/</span><span>Articles</span></nav>
      <h1>Field notes<br><em>from production.</em></h1>
      <p class="post-lede">{e(desc)} <a href="{SITE}/feed.xml">Subscribe via RSS</a> or follow on <a href="https://eng-zakaria.medium.com" target="_blank" rel="noopener noreferrer">Medium</a>.</p>
    </section>
""")
    tags = sorted({t for p in posts for t in p["tags"]}, key=str.lower)
    if tags:
        out.append('    <div class="posts-filter" role="group" aria-label="Filter by topic"><button type="button" class="filter-btn active" data-tag="all">All</button>'
                   + "".join(f'<button type="button" class="filter-btn" data-tag="{e(t)}">{e(t)}</button>' for t in tags) + "</div>\n")
    if posts:
        out.append('    <div class="posts-list">\n')
        for p in posts:
            out.append("      " + card(p, f"{p['slug']}.html").replace('<article class="post-card"',
                       f'<article class="post-card" data-tags="{e("|".join(p["tags"]))}"', 1) + "\n")
        out.append("    </div>\n")
    else:
        out.append('    <p class="posts-empty">The first article is on its way. Meanwhile, read my posts on <a href="https://eng-zakaria.medium.com" target="_blank" rel="noopener noreferrer">Medium</a>.</p>\n')
    out.append("  </main>\n")
    out.append(footer("../"))
    return "".join(out)


def render_feed(posts: list[dict]) -> str:
    items = []
    for p in posts[:20]:
        url = f"{SITE}/articles/{p['slug']}.html"
        when = dt.datetime.combine(p["date"], dt.time(9, 0), tzinfo=dt.timezone(dt.timedelta(hours=2)))
        cats = "".join(f"<category>{e(t)}</category>" for t in p["tags"])
        body = p["html"].replace("]]>", "]]]]><![CDATA[>")
        items.append(f"""    <item>
      <title>{e(p['title'])}</title>
      <link>{url}</link>
      <guid isPermaLink="true">{url}</guid>
      <pubDate>{format_datetime(when)}</pubDate>
      <description>{e(p['summary'])}</description>
      {cats}
      <content:encoded><![CDATA[{body}]]></content:encoded>
    </item>""")
    # stable: only changes when the newest post changes, so rebuilds don't dirty git
    newest = posts[0]["date"] if posts else dt.date(2026, 11, 8)
    now = format_datetime(dt.datetime.combine(newest, dt.time(9, 0), tzinfo=dt.timezone(dt.timedelta(hours=2))))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{AUTHOR} — Articles</title>
    <link>{SITE}/articles/</link>
    <atom:link href="{SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Practical, production-tested writing on data engineering, data quality, and the data layer behind AI.</description>
    <language>en</language>
    <lastBuildDate>{now}</lastBuildDate>
{chr(10).join(items)}
  </channel>
</rss>
"""


def render_sitemap(posts: list[dict]) -> str:
    urls = [(f"{SITE}/", None), (f"{SITE}/articles/", None)]
    urls += [(f"{SITE}/articles/{p['slug']}.html", p["date"].isoformat()) for p in posts]
    for page in sorted((ROOT / "projects").glob("*.html")):
        if page.stem == "airsense-platform":
            continue
        urls.append((f"{SITE}/projects/{page.name}", None))
    rows = "\n".join(f"  <url><loc>{u}</loc>{f'<lastmod>{d}</lastmod>' if d else ''}</url>" for u, d in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{rows}\n</urlset>\n'


def render_home_block(posts: list[dict]) -> str:
    if not posts:
        return f"{HOME_START}\n      {HOME_END}"
    cards = "\n".join("          " + card(p, f"articles/{p['slug']}.html", " reveal") for p in posts[:3])
    return (f"{HOME_START}\n"
            f'      <div class="native-articles">\n'
            f'        <div class="native-articles-head"><span class="native-articles-label">On this site</span>'
            f'<a class="proj-link" href="articles/index.html">All {len(posts)} article{"s" if len(posts) != 1 else ""} →</a></div>\n'
            f'        <div class="native-articles-grid">\n{cards}\n        </div>\n'
            f'        <div class="native-articles-label native-articles-label-alt">Also on Medium</div>\n'
            f"      </div>\n      {HOME_END}")


def code_css() -> str:
    light = HtmlFormatter(style="friendly").get_style_defs('html[data-theme="light"] .hl')
    dark = HtmlFormatter(style="github-dark").get_style_defs('html[data-theme="dark"] .hl')
    strip = lambda css: "\n".join(l for l in css.splitlines() if " .hl {" not in l or "background" not in l)
    return ("/* generated by scripts/build_articles.py, do not edit */\n"
            + strip(light) + "\n" + strip(dark) + "\n")


def write(path: Path, text: str) -> bool:
    text = text.replace("\r\n", "\n")
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True


def update_home(block: str) -> bool:
    p = ROOT / "index.html"
    raw = p.read_bytes().decode("utf-8")
    crlf = "\r\n" in raw
    s = raw.replace("\r\n", "\n")
    if HOME_START not in s:
        raise PostError("index.html is missing the native-articles markers")
    new = re.sub(re.escape(HOME_START) + r".*?" + re.escape(HOME_END), lambda _: block, s, flags=re.S)
    if new == s:
        return False
    p.write_bytes((new.replace("\n", "\r\n") if crlf else new).encode("utf-8"))
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--drafts", action="store_true", help="also render drafts (local preview, never commit)")
    args = ap.parse_args()

    sources = [(f, False) for f in sorted(POSTS.glob("*.md"))]
    if args.drafts:
        sources += [(f, True) for f in sorted(DRAFTS.glob("*.md"))]
    posts, errors = [], []
    for f, in_drafts in sources:
        try:
            p = read_post(f, in_drafts)
        except PostError as ex:
            errors.append(str(ex))
            continue
        if p["draft"] and not args.drafts:
            print(f"  skip draft  {p['source']}")
            continue
        posts.append(p)
    if errors:
        print("Errors:\n  " + "\n  ".join(errors), file=sys.stderr)
        return 1
    slugs = [p["slug"] for p in posts]
    if len(slugs) != len(set(slugs)):
        print("Two posts share a file name; slugs must be unique.", file=sys.stderr)
        return 1
    posts.sort(key=lambda p: (p["date"], p["slug"]), reverse=True)
    published = [p for p in posts if not p["draft"]]

    changed = []
    prev_generated = set(json.loads(MANIFEST.read_text())) if MANIFEST.exists() else set()
    generated = set()
    for i, p in enumerate(posts):
        out = ARTICLES / f"{p['slug']}.html"
        prev = posts[i - 1] if i > 0 else None
        nxt = posts[i + 1] if i + 1 < len(posts) else None
        if write(out, render_post(p, prev, nxt)):
            changed.append(out)
        generated.add(out.name)
    if not args.drafts:
        # drop pages of removed posts and any leftover draft previews
        draft_slugs = {f.stem for f in DRAFTS.glob("*.md")} | {f.stem for f in POSTS.glob("*.md")}
        for stale in (prev_generated | {s + ".html" for s in draft_slugs}) - generated:
            f = ARTICLES / stale
            if f.exists():
                f.unlink()
                print(f"  removed     articles/{stale}")
    if not args.drafts:
        write(MANIFEST, json.dumps(sorted(generated), indent=2) + "\n")

    listing = posts if args.drafts else published
    for path, text in [
        (ARTICLES / "index.html", render_index(listing)),
        (ROOT / "css" / "article-code.css", code_css()),
    ]:
        if write(path, text):
            changed.append(path)
    if not args.drafts:
        for path, text in [
            (ROOT / "feed.xml", render_feed(published)),
            (ROOT / "sitemap.xml", render_sitemap(published)),
            (ROOT / "robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n"),
        ]:
            if write(path, text):
                changed.append(path)
        if update_home(render_home_block(published)):
            changed.append(ROOT / "index.html")

    for p in posts:
        flag = "DRAFT" if p["draft"] else "post "
        print(f"  {flag}       articles/{p['slug']}.html  ({p['minutes']} min, {p['words']} words)")
    print(f"Built {len(published)} published post(s)"
          + (f" + {len(posts) - len(published)} draft preview(s)" if args.drafts else "")
          + f"; {len(changed)} file(s) changed.")
    if args.drafts and len(posts) != len(published):
        print("Draft previews are local only. Run without --drafts before committing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
