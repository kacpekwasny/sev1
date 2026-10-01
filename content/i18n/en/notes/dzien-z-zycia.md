---
title: "A day (and a month) in the life of a Network SWE"
summary: "How much coding, reading, and firefighting there is — and where priorities come from."
tags: [work]
---

# A day (and a month) in the life of a Network SWE

## A typical month

| Week | What happens |
|---|---|
| 1 | Sprint planning, new feature design, reviewing other people's changes |
| 2 | Code and tests, lab work, interrupted by an incident |
| 3 | Incident follow-up, postmortem, corrective actions, an old backlog task |
| 4 | Staged rollout, watching metrics, retrospective |

There is always a plan, but it rarely survives reality intact. One skill university
does not teach: **deciding what not to do this week**.

## How much coding is there?

Less than you might expect, which is good news. A change to [[frr-i-gobgp|GoBGP]]
or our service is often a few dozen lines, preceded by two days of reading code,
RFCs, and logs. The biggest changes often involve **removing** something.

There is also code nobody counts as “real” work: diagnostic tools, lab topology
generators, and scripts comparing RIBs before and after a change.

## The team's rhythm

- **Daily** — ten minutes, mainly so someone can say “I have the same problem; let's talk.”
- **Planning** — what we take on, and why.
- **Retro** — what frustrated us; useful only when it leads to action.
- **On-call** — taking a shift; see [[sev1-incydent|A Sev1 incident]].

## What is really hard?

Not algorithms. The hard part is understanding a system nobody knows completely,
changing it without taking it offline, and proving the change works before a
customer encounters it.

Related: [[drabinka|Career ladder]], [[qa-sdet|QA and SDET]], [[rozmowa-o-prace|The interview]]
