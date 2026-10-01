---
title: "Sev1 — anatomy of an incident"
summary: "What Sev1 means, what the first hour looks like, and why this is not a story about blame."
tags: [work, incidents]
---

# Sev1 — anatomy of an incident

**Sev1** (severity 1) is the highest incident category: a large-scale customer
impact that cannot wait until morning.

## The first hour

1. **Someone notices** — an alert, a call from a neighboring team, or a customer.
2. **Incident commander** — one person coordinates the process rather than debugging.
3. **Mitigation before diagnosis** — restore traffic first, then understand what happened. A rollback is usually quicker than understanding the failure.
4. **Channel and timeline** — record everything; three days later, nobody will remember the event order.

## What really hurts

Rarely one bug. Usually a Friday release, a missing constraint, and a mechanism
that *amplifies* a failure instead of containing it. See [[fib-i-whiteboxy|FIB limits]]:
a full FIB is a classic example. The device does not crash; it silently loses routes.

## A blameless postmortem

After an incident, we write a postmortem: what happened, what worked, what did
not, and corrective actions. **Blameless** is practical: a culture of finding
someone to blame discourages early error reports.

Related: [[dzien-z-zycia|A Network SWE's day]], [[centrum-obliczeniowe|Inside a data center]]
