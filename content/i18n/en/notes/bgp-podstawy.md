---
title: "BGP in five minutes"
summary: "Sessions, prefixes, attributes, and best-path selection — enough to understand what follows."
tags: [networking, bgp]
---

# BGP in five minutes

BGP is the protocol routers use to tell each other **which networks they can reach**.
It holds the Internet together and is also used inside data centers.

## Sessions

A BGP session is an ordinary TCP connection on port 179 between two routers (peers).
After connecting, they exchange prefixes; from then on, they send only changes.

- **eBGP** — between different autonomous systems (ASs).
- **iBGP** — within one AS.

## What is advertised

A prefix (`10.0.0.0/24`) plus attributes, including:

| Attribute | Purpose |
|---|---|
| `next-hop` | Where to send the packet |
| `as-path` | The ASs the route has passed through; prevents loops |
| `local-pref` | Which path we prefer within an AS |
| `med` | A suggestion to a neighbor about which entry point to use |
| `communities` | Policy labels — our main way of controlling traffic |

## Route selection

When several paths to the same prefix arrive, the router evaluates criteria in
order: highest `local-pref`, then shortest `as-path`, then `med`, then eBGP before
iBGP, then lowest cost to the next hop. The first criterion that distinguishes
the candidates decides the winner.

## RIB vs. FIB

This distinction comes up in every incident:

- **RIB** — everything learned, held in the routing process's memory.
- **FIB** — the subset installed in hardware, actually used to forward packets.

The RIB may have millions of entries. The FIB holds only what fits in silicon —
see [[fib-i-whiteboxy|Whiteboxes and a FIB that's too small]].

Implementations we work with: [[frr-i-gobgp|FRR and GoBGP]].

Related: [[route-server|Route server]], [[overlay|Overlay]]
