---
title: "QA and SDET — more than you might think"
summary: "Testing a distributed system means programming, with the same salary bands."
tags: [work, testing]
---

# QA and SDET — more than you might think

## Where the misunderstanding comes from

“QA” brings to mind clicking through forms. But when a system requires setting
up a dozen routers, simulating a link failure, and verifying traffic recovery
within 300 ms, clicking gets you nowhere.

## The path

**Manual QA → automation QA → SDET** (Software Development Engineer in Test).
An SDET writes code full time: test frameworks, topology simulators, and tools
comparing state before and after a change. At Akamai, it uses the same ladder and
salary bands as SWE; see [[drabinka|Career ladder]].

## What a networking SDET actually does

- Builds a lab that can reproduce a production failure — the hardest part.
- Writes tests running [[frr-i-gobgp|FRR and GoBGP]] against each other and checking that they see the same routes.
- Finds edge cases the author missed: a session flap during convergence, an MTU one byte too small, a restart halfway through an update.
- Automates **reproduction**, because a bug you cannot reproduce is not fixed.

## Why it is interesting

Breaking a system meaningfully requires understanding it better than its author.
The hardest [[sev1-incydent|incident]] bugs are not typos, but situations nobody
anticipated. That is exactly this job.

Related: [[dzien-z-zycia|A Network SWE's day]], [[ip-sharing|IP Sharing]]
