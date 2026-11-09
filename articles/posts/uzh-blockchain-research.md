---
title: "Mining Ethereum with the University of Zurich"
date: 2026-11-09
summary: "A look back at my remote 2023 Blockchain Analysis internship with UZH and its Deep Dive into Blockchain summer school: data pipelines and validation over Ethereum and a university blockchain, Solidity smart contracts, and what raw chain data teaches a data engineer."
tags: [Career, Blockchain, Research]
draft: false
---

From June to August 2023, between my third and fourth years at Helwan University, I worked remotely as a Blockchain Analysis Intern for the University of Zurich (UZH). This is a career reflection; the facts come from my CV, my UZH programme confirmation and the project write-ups linked below. The rest is my own view of what working with raw blockchain data does to the way a data engineer thinks.

## What the internship covered

The work sat inside UZH's Web3 and Fintech research, and it had two sides: data engineering over blockchain data, and smart-contract development in Solidity.

On the data side, I used Python to extract and process Ethereum datasets for research, working from raw node data at the level of blocks and transactions. We worked with public Ethereum data and a university-run research chain. Three kinds of output came out of that work:

- **Pipelines** that pulled chain data into a shape researchers could use.
- **Validation and sanitization scripts** for the raw node data, so that what reached analysis had been checked first.
- **On-chain summaries and data-quality reports** that gave stakeholders a view of the health of the data and the trends in it.

On the development side, I wrote smart contracts in Solidity. Doing both in the same summer was useful: writing contracts showed me how the records I was validating get produced in the first place, and validating the data showed me what a contract leaves behind on chain.

The internship ran alongside UZH's Deep Dive into Blockchain programme. The confirmation letter from UZH's Global Student Experience office states that I took part in the online UZH International Summer Schools, 2 to 21 July 2023, in the course "Deep Dive into Blockchain – Linking Economics, Technology and Law". It also notes that the achievements and ECTS credits are recorded in a separate Transcript of Records. On my site I describe the course content as Ethereum, Polkadot, Bitcoin and more than 20 other protocols, covering consensus, smart contracts and on-chain data models.

```text
2023-06 ─────────── Blockchain Analysis Intern, UZH, remote (06/2023 – 08/2023)
2023-07-02 ── 07-21  Deep Dive into Blockchain summer school (online), UZH
2023-08 ─────────── internship ends
        ...
2025-04 ── 2026-02   blockchain-analyzer (independent, not UZH work)
later                ChainGuard privacy-layer prototype (independent)
```

The course title matters more than it might seem. Economics, technology and law are three different ways of reading the same ledger. A transaction is a technical record, it is also an economic event, and in many places it is a legal fact too. That framing stayed with me longer than any single protocol detail.

## What raw chain data teaches you

Blockchain data has a few properties that I think are useful lessons for anyone heading into data engineering, whether or not they ever touch crypto again.

**The source is public, but that doesn't make it ready.** Anyone can read an Ethereum node, and that openness makes it tempting to treat the data as already trustworthy. In practice, raw node output is a stream of records in the chain's own formats, and values, addresses and timestamps all have to be decoded and checked before they mean anything to an analyst. These are the kinds of problems my validation scripts caught:

- **Duplicate or orphaned blocks after chain reorganisations**, where a block that was fetched later stopped being part of the main chain.
- **Hex-encoded values and unit conversion**, where amounts arrive as hex strings in wei and have to be decoded and converted to ether before anyone can sum them.
- **Contract-creation transactions with a null `to` address**, which break any logic that assumes every transaction has a recipient.
- **Failed transactions that still appear in blocks**, which have to be flagged so they are not counted as transfers that happened.
- **Gaps in block ranges from interrupted fetches**, which make a period look quieter than it was unless you check that the range is complete.

None of these is exotic, and that is the point: the data is "correct" as far as the node is concerned, and still wrong for analysis until you handle each case. The same habit, check the data before you trust it, is the core of how I work today, and I wrote it up in [my data quality toolkit](../articles/data-quality-toolkit.html).

**Research users and dashboard users want different things.** A researcher wants the data as close to the source as possible, with the transformations documented, so they can defend their method. A stakeholder reading a data-quality report wants to know, quickly, whether the data can be used. Writing both kinds of output in the same summer taught me to ask early who a dataset is for. I still ask that before I design any table.

**A summary is also a test.** When you produce on-chain summaries, such as counts or totals over a period, you are also checking whether the pipeline behind them is behaving. A summary that suddenly looks wrong is often the first sign that something upstream changed. I now treat reporting and monitoring as one job, not two.

## What I would tell someone starting out

**Take the data role even if the domain is new to you.** The skills that carry this kind of work are Python, careful handling of raw records, and clear reporting. Domain knowledge can come from a course and from the data itself. Data engineering skills transfer between domains much better than people expect.

**Learn how the data is made, not just how it is read.** Writing Solidity alongside the pipelines made the raw records far easier to reason about. If you can, spend some time on the system that produces your data.

**Do the course and the work together if you can.** The Deep Dive programme ran in July, in the middle of the internship. Learning how a protocol works while you are handling its raw data gives the theory somewhere to land.

**Write the quality report even if nobody asks for it.** The data-quality reports were part of my brief, but I would recommend the habit to anyone. A short note on what you checked, what failed and what you excluded makes your work easier to trust and easier to hand over.

**Keep the boundary between employer work and your own work clean.** What I did for UZH belongs to that research context. When I later wanted to go deeper into chain analytics, I built my own projects from scratch and described them as my own.

## Where the interest went next

The internship ended in August 2023, but the interest didn't. Two later, independent projects grew out of it. Neither is UZH work.

| Project | When | What it explores |
|---|---|---|
| Ethereum forensics harness | Apr 2025 – Feb 2026 | A Bronze/Silver/Gold pipeline, three money-laundering detectors and a harness for timing Neo4j against Spark on multi-hop money-flow queries |
| ChainGuard privacy layer | Later prototype | Masking personal data in on-chain and market feeds before analytics, with an audit-log table and retention scheduling |

The first is written up in [Neo4j vs Spark for multi-hop money flows](../articles/ethereum-neo4j-vs-spark.html). It is the graph-versus-batch question that working with transaction data raises: money moves across many hops, and some engines handle that better than others. That post covers the harness and the real-engine run that comes next.

The second is [Masking on-chain data for GDPR](../articles/gdpr-native-chain-analytics.html). It goes back to the "law" part of the UZH course title: public ledgers and privacy rules pull in different directions, and a data engineer sits in the middle. That post walks through the ChainGuard design and what a privacy gate can and can't do.

## Looking back

The UZH internship was my first time doing data work for a research setting, on data I didn't control, for people who would build arguments on top of it. That raised the bar on validation and on documentation, and the bar has stayed there. If I had to name the one habit I took from that summer, it is this: before you analyse anything, find out what is wrong with it, and write that down.
