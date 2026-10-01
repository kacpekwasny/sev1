---
title: "SRv6 — routing encoded in an address"
summary: "SIDs, segment lists, and why source routing is useful in 2026."
tags: [networking, srv6, ipv6]
---

# SRv6 — routing encoded in an address

**Segment Routing over IPv6** encodes a packet's path in the packet itself,
rather than keeping state in every router along the way.

## SID

A **SID** (Segment Identifier) is an ordinary [[ipv6|IPv6]] address interpreted
as an instruction. It has several parts:

```
 2001:db8:  aaaa:    0100  ::
 \_______/  \____/   \___/
  locator  function argument
```

- **Locator** — a routable prefix leading to a particular node.
- **Function** — what that node should do, such as `End.DT4`: decapsulate and deliver to the customer's VRF table.
- **Argument** — additional context for the function.

The useful part is that the intermediate network need not know about SRv6.
It sees an ordinary IPv6 address and routes it to the locator.

## Segment list

To force a path through several points, the packet gets an SRH header with a list
of SIDs and an index indicating the active one. Each successive node processes
its segment and forwards the packet.

## Why we use it

- [[overlay|Overlay]] without a separate encapsulation protocol — IPv6 is enough.
- Traffic engineering: “send this traffic here”, without state in the network's interior.
- Fewer components to maintain than with MPLS.

## Where it hurts

SID advertisements use [[bgp-podstawy|BGP]], and implementations differ in encoding
details. That is why we spend so much time checking whether [[frr-i-gobgp|FRR and GoBGP]]
understand the same thing. MTU also matters: every additional header takes space
away from data.

Related: [[gpu-clusters|GPU clusters]], [[dzien-z-zycia|A Network SWE's day]]
