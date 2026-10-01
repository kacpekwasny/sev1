---
title: "Set up your own route server"
summary: "A laptop lab: four routers, one route server, no full mesh."
difficulty: latwe
time: "1–2 h"
tags: [bgp, lab, frr, gobgp]
notes: [route-server, bgp-podstawy, frr-i-gobgp]
links:
  - title: "GoBGP — getting started"
    url: "https://github.com/osrg/gobgp/blob/master/docs/sources/getting-started.md"
  - title: "FRRouting — BGP documentation"
    url: "https://docs.frrouting.org/en/latest/bgp.html"
  - title: "containerlab — container-based network labs"
    url: "https://containerlab.dev/"
hints:
  - title: "Start with two routers, not five"
    text: |
      Establish one BGP session between two FRR containers and advertise one
      prefix. Add more only when that works. Most lab time goes into address
      typos, not routing.
  - title: "Session will not come up — check in order"
    text: |
      1. Can the hosts ping each other? 2. Is port 179 open (`ss -tlnp`, container
      iptables)? 3. Do AS numbers match on both sides? 4. In `show bgp neighbor`,
      which state is stuck: Active, Connect, or OpenSent? Each tells a different story.
  - title: "The route is in the RIB, but not the kernel"
    text: |
      Compare `show bgp ipv4 unicast` with `ip route`. The most common cause is
      an unreachable `next-hop`. A route server usually preserves the sender's
      original next hop; without a path to it, the receiver rejects the route.
  - title: "An extension for the ambitious"
    text: |
      Instead of static configuration, write a small Go program injecting routes
      through GoBGP's gRPC API. This is literally what we do at work: a service
      generates routes, and BGP is their transport.
---

Build a small lab where four routers exchange routes through one **route server**
rather than connecting every router to every other router.

## Your task

1. Run five containers: four FRR instances and one GoBGP route server, or use FRR for everything. `containerlab` is convenient, but ordinary `docker compose` works too.
2. Every router has a session **only** with the route server.
3. Each advertises its own prefix, such as `10.0.X.0/24`.
4. Verify router 1 sees router 4's prefix and the next hop leads directly to router 4, not to the route server.
5. Stop the route server. What happens to the routes, and after how long?

## Questions to answer

- How many BGP sessions do you have? How many would a full mesh require for the same four routers? For a hundred?
- What changes when you add a second route server?

## Deliverable

A `docker-compose.yml` file or `containerlab` topology, plus a short README with
`show bgp summary` results. A working lab is an excellent internship interview
topic: your own functioning topology says more than a line on a CV.

Context: [[route-server|Route server]].
