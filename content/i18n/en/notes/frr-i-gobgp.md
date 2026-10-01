---
title: "FRR and GoBGP"
summary: "Two BGP implementations we use daily, and why we need both."
tags: [networking, bgp, tools]
---

# FRR and GoBGP

## FRR (FRRouting)

A traditional routing stack in C: separate daemons (`bgpd`, `zebra`, `staticd`) and
a CLI resembling Cisco equipment. It installs Linux kernel routes through `zebra`.

```
vtysh -c "show bgp ipv6 unicast summary"
vtysh -c "show bgp ipv6 unicast 2001:db8::/48"
```

We use it when we want a complete, mature BGP stack on a host.

## GoBGP

BGP written in Go, controlled through gRPC. Instead of interactive CLI
configuration, it has an API. This changes the way you think: a BGP session becomes
part of a program rather than part of a device configuration.

```
gobgp global rib -a ipv6
gobgp neighbor 2001:db8::1 adj-in
```

It works well as a [[route-server|route server]] and wherever one of our services
generates routes.

## Why both?

FRR has more features; GoBGP is easier to integrate into code and tests. In
practice, they talk to each other, and much of our work is checking that they
interpret things the same way, such as [[srv6|SRv6]] extensions.

An exercise based on a real problem: [[zadania/gobgp-pamiec|GoBGP uses too much memory]].

Related: [[bgp-podstawy|BGP basics]], [[dzien-z-zycia|A Network SWE's day]]
