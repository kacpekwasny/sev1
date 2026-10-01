---
title: "300,000 routes, room for 32,000"
summary: "A design exercise: what to do when the routing table does not fit in hardware."
difficulty: srednie
time: "1–2 h"
tags: [bgp, design, fib]
notes: [fib-i-whiteboxy, bgp-podstawy, overlay]
hints:
  - title: "Divide routes into classes"
    text: |
      Not all routes are equally important. Start with routes to machines in the
      same rack, within the data center, in other regions, and on the Internet.
      Which classes actually need specific entries in hardware?
  - title: "A default is a route too"
    text: |
      If all Internet traffic leaves over two links anyway, `0.0.0.0/0` and `::/0`
      with suitable `local-pref` values can replace 900,000 prefixes. What do you
      lose? Hint: choosing a better exit, and quickly detecting that a neighbor
      has lost reachability to part of the world.
  - title: "Aggregation and what it hides"
    text: |
      Sixteen `/24`s can be advertised as one `/20`, but only if they all really
      lead to the same place. What happens when one `/24` disappears while you
      still advertise the aggregate? That is a classic way to create a black hole.
  - title: "Check that you know the capacity"
    text: |
      None of this makes sense without measurement. How do you check current TCAM
      usage on your platform? At which threshold should an alert fire, and why
      should it definitely not be 100%?
---

You get a whitebox with hardware capacity for **32,768** routes. Your network sees
**300,000** prefixes, growing by a few percent each year. Replacing hardware is
not an option this quarter.

## Your task

Write a one-page design — really one page — answering:

1. Which routes **must** stay in hardware, and which can disappear from the FIB?
2. What does your input filter look like? Write a policy sketch or FRR configuration.
3. What happens if you still exceed the limit? How will you know **before** customers do?
4. What risks does your solution introduce, and how do you reduce them?

## Success criterion

There is no single correct answer. A good answer names the **tradeoff**: what you
gain, what you lose, and when your solution fails. That is exactly what a technical
design sent to a team for review looks like.

Context: [[fib-i-whiteboxy|Whiteboxes and FIB limits]].
