---
title: "IPv6 — what you should know"
summary: "More addresses are only part of the story. What can you do with them?"
tags: [networking, ipv6]
---

# IPv6 — what you should know

## A few basics

- Addresses are 128 bits, written in hexadecimal: `2001:db8:1::5`.
- A typical subnet is `/64`; a customer allocation is often `/48` or `/56`.
- There is no ARP; NDP (Neighbor Discovery) uses ICMPv6. Blocking ICMPv6 breaks networking.
- Routers do not fragment packets; the sender must handle PMTUD.
- An interface usually has several addresses: link-local `fe80::/10` and global addresses.

## Why it matters to us

At data-center scale, IPv4 runs out in practice, not just in theory. But something
else is more interesting: **128 bits leave plenty of room for information**.
An address can mean both “where to go” and “what to do”.

[[srv6|SRv6]] builds on this: the first part of an address identifies a node, and
the rest tells it which operation to perform.

## Practical pain points

- Tools and scripts originally written for IPv4 (`inet_aton`, regex parsing).
- Policies configured twice: adding a rule for only one address family is a classic cause of an [[sev1-incydent|incident]].
- People who “saw IPv6 in a lecture” and hope they will never need it.

Related: [[bgp-podstawy|BGP basics]], [[gpu-clusters|GPU clusters]]
