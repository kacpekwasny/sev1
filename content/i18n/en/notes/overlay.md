---
title: "Overlay — the postal worker and the parcel"
summary: "How a packet reaches another VM when the physical network knows nothing about either VM."
tags: [networking, overlay]
---

# Overlay — the postal worker and the parcel

## The analogy

You send a parcel to a friend in a dormitory. On the envelope, you write the
**dormitory's** address, not the room number: the postal service knows nothing
about rooms. At reception, someone checks the note inside and takes it to the
right door.

- Envelope = outer header, **host** addresses (underlay).
- Parcel inside = original VM packet (overlay).
- Reception = destination host, which unwraps the packet and delivers it to the right VM.

## Why do this?

- Customer addressing is **their business**; two customers can both use `10.0.0.0/8`.
- The physical network only knows host addresses, keeping its [[fib-i-whiteboxy|FIB]] small.
- A VM can move to another host without changing its address; only the outer envelope changes.

## How is it wrapped?

VXLAN, Geneve, GRE, and increasingly [[srv6|SRv6]] in our environment. Their headers
and the information they can carry differ, but the idea is the same.

## How does a host know where to send the envelope?

Someone must advertise “VM address X is on host Y”. The control plane does that:
BGP with the EVPN family, or our own service. A [[route-server|route server]] acts
as an intermediary so every host does not need to talk to every other host.

Related: [[bgp-podstawy|BGP basics]], [[ip-sharing|IP Sharing]]
