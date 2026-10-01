---
title: "Whiteboxes and a FIB that's too small"
summary: "Why a switch costing 30,000 cannot hold the routing table, and what to do about it."
tags: [networking, hardware]
---

# Whiteboxes and a FIB that's too small

A **whitebox** is a switch without the vendor's firmware: standard hardware
(often Broadcom silicon) plus an operating system we choose, such as SONiC with
[[frr-i-gobgp|FRR]]. Cheaper and more flexible, but the responsibility is ours.

## The hard limit

An ASIC forwards packets, and its table ([[bgp-podstawy|FIB]]) lives in expensive,
fast TCAM. It has a **small, fixed capacity**, typically tens of thousands of
entries. The Internet BGP table contains over 900,000 IPv4 prefixes in the
lecture's example.

## What happens when it overflows?

The worst part is that nothing explodes. Depending on the platform:

- Extra routes stay in the RIB and never reach the hardware.
- Traffic for them is sent to the CPU (*punt*), which quickly becomes overloaded.
- A route silently disappears, and packets follow a default in the wrong direction.

The symptom: “Some traffic works and some doesn't, but `show bgp` says everything is fine.”

## How we handle it

1. **Input filtering** — do not accept routes we will not use.
2. **Aggregation** — one `/20` instead of sixteen `/24`s.
3. **Default route** — local specifics, the rest of the world in one entry.
4. **Overlay** — customer routes never enter the hardware; see [[overlay|Overlay]].
5. **TCAM monitoring** — alert at 80%, not 100%.

Exercise: [[zadania/fib-nie-miesci-sie|300k routes, 32k entries]].

Related: [[centrum-obliczeniowe|Inside a data center]], [[sev1-incydent|A Sev1 incident]]
