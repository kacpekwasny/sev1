---
title: "Inside a data center"
summary: "Racks, ToRs, spine-leaf topology, and redundancy — the physical picture behind everything else."
tags: [dc, basics]
---

# Inside a data center

## From the bottom up

- **Server** — 1U or 2U, mounted in a rack on rails.
- **Rack** — 42U, containing dozens of servers and a switch at the top.
- **ToR (top of rack)** — the switch connecting the servers in a rack.
- **Row of racks, hall, building** — surrounded by power, cooling, and fiber links.

## Spine-leaf topology

```
        spine1     spine2     spine3
          |  \     /  |  \     /  |
          |   \   /   |   \   /   |
        leaf1      leaf2      leaf3     <- ToR
          |          |          |
        [rack]     [rack]     [rack]
```

Every leaf connects to every spine. The path between any two servers has the same
number of hops, and capacity grows by adding spines rather than replacing one
huge device. Traffic is spread across parallel paths using ECMP.

The drawing above fits in a text file. To explore a larger network, its devices,
links, BGP sessions, and packet paths, open
[[topologie/dc|the interactive data-center explorer]].

## Redundancy

Everything comes in pairs: two power supplies on separate feeds, two uplinks to
different ToRs, and at least two spines. The rule is: **a single component failure
must not take a service down**. This lets planned maintenance take half the
network offline in the middle of the day.

The rest of the lectures build on this picture: [[bgp-podstawy|routing]] between
these devices, followed by the [[overlay|overlay]] above them.

Related: [[fib-i-whiteboxy|Whiteboxes and FIB limits]], [[gpu-clusters|GPU clusters]], [[po-co-cloud|Why cloud?]]
