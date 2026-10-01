---
title: "Why use cloud?"
summary: "Why companies hand their servers to someone else — and when it does not pay off."
tags: [cloud, basics]
---

# Why use cloud?

You can buy a server. The problem is everything around it.

## What the server price does not include

- **Power and cooling** — a rack can draw well over ten kW, plus backup power, generators, and redundant cooling.
- **Connectivity** — at least two carriers, your own ASN, [[bgp-podstawy|BGP]] sessions, and DDoS protection.
- **People** — someone must replace a disk at 3 a.m. and answer the phone.
- **Time** — hardware orders take weeks. A cloud machine starts in a minute.

## When do your own servers make sense?

When the load is stable and predictable, and the scale justifies hiring a team.
Then owning infrastructure can be cheaper, which is why large companies often use
both approaches.

## What changes for a network engineer?

Cloud gives the customer **their own** network on **shared** hardware. Customers'
addressing must not interfere, traffic must remain isolated, and everything must
be programmable. This leads to [[overlay|overlay]] and [[ip-sharing|IP Sharing]].

Related: [[centrum-obliczeniowe|Inside a data center]]
