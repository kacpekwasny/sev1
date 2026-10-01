---
title: "GPU clusters and a network that must keep up"
summary: "Why networking becomes a bottleneck during model training, and what that means for addressing."
tags: [networking, gpu, dc]
---

# GPU clusters and a network that must keep up

## What makes them different?

Ordinary data-center traffic is uneven and forgiving: a packet can be lost, and
TCP retransmits it. Large-model training is different: thousands of GPUs compute
a step, then **all at once** exchange results (all-reduce).

The consequences:

- Traffic is synchronized and enormous — hundreds of gigabits per node.
- The whole cluster waits for the slowest transfer, so tail latency matters more than the average.
- A lost packet and retransmission can stall a computation step.

This is why RDMA (RoCE) and lossless networking are used rather than ordinary TCP
over ordinary Ethernet.

## An address per interface, not a loopback

A host usually needs just one loopback address, with the network choosing the
interface. A GPU cluster reverses that: a NIC is associated with a particular
GPU, ideally on the same PCIe bus, so **we want to explicitly choose the NIC**.

An address per interface provides:

- Predictable traffic distribution across parallel paths.
- A way for the application to select a specific card.
- Clear diagnostics: you can see which link is overloaded.

The cost is more addresses and more [[bgp-podstawy|BGP]] sessions, bringing us back
to [[fib-i-whiteboxy|FIB capacity]] and [[route-server|route servers]].

Related: [[centrum-obliczeniowe|Inside a data center]], [[ipv6|IPv6]]
