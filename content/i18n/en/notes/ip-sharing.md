---
title: "IP Sharing"
summary: "One address, many machines — the simple version, and the harder version inside a VPC."
tags: [networking, cloud]
---

# IP Sharing

## The simple version

A customer has two machines and wants either one to serve the same public address
in case of failure. The address is **assigned** to one machine; during failover,
its route is advertised from a different location.

What must work:

- The host taking over the address advertises it through BGP or a mechanism such as VRRP.
- The old host stops advertising it, or traffic splits between two owners.
- Neighbors notice the change **quickly**, mainly a matter of convergence time.

Advertising the address is not the hard part. Ensuring there are never two owners,
and keeping the interruption shorter than the customer's patience, is.

## VPC IP Sharing

Inside a [[overlay|VPC]], an address belongs to the customer's network rather than
to a host. The same address can exist for many customers at once, and a machine
can take it over on another host, in another rack, or sometimes in another region.

Now we need to decide:

- Who owns the address **at this moment**, and how everyone else learns that.
- How encapsulation works when the inner address stays fixed but the outer one changes.
- What happens to traffic already in flight during failover.
- How to test a bug that only appears under load.

This is where a “simple problem” becomes several weeks of work and a substantial
test suite; see [[qa-sdet|QA and SDET]].

Related: [[po-co-cloud|Why cloud?]], [[route-server|Route server]]
