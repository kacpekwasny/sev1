---
title: "GoBGP uses too much memory"
summary: "A real work problem: the BGP process keeps growing. A leak, or expected usage?"
difficulty: trudne
time: "2–4 h"
tags: [go, gobgp, profiling, srv6]
notes: [frr-i-gobgp, srv6]
links:
  - title: "Internal notes: gobgp-srv6-memory (Akamai network access only)"
    url: "https://bits.linode.com/kkwasny/gobgp-srv6-memory"
  - title: "GoBGP v3.32.0 — table/path.go (older version)"
    url: "https://github.com/osrg/gobgp/blob/v3.32.0/internal/pkg/table/path.go#L1045-L1053"
  - title: "GoBGP v4.7.0 — table/path.go (newer version)"
    url: "https://github.com/osrg/gobgp/blob/v4.7.0/internal/pkg/table/path.go#L1048"
  - title: "pprof documentation"
    url: "https://pkg.go.dev/net/http/pprof"
hints:
  - title: "Start by measuring, not reading code"
    text: |
      Before blaming the source, measure. GoBGP can expose `net/http/pprof`.
      Capture the heap at 100k and 1M routes:

      ```
      go tool pprof -http=:8081 http://localhost:6060/debug/pprof/heap
      ```

      Look at `inuse_space`, grouped by allocation site.
  - title: "A leak or intrinsic cost?"
    text: |
      A leak is memory that **is not freed after routes are removed**. One
      experiment distinguishes them: load routes, withdraw them all, force GC
      (`runtime.GC()` / `debug.FreeOSMemory()`), and measure again. If usage
      returns to baseline, you have an expensive route representation rather
      than a leak.
  - title: "Calculate how much it should use"
    text: |
      Estimate how many bytes one route *must* need for its prefix, next hop,
      and attributes. Multiply by route count and compare with measurements.
      If usage is several times larger, look for duplicates: identical attributes
      (`as-path`, `communities`, SIDs) stored separately for each path rather
      than shared.
  - title: "Compare versions"
    text: |
      Compare the same parts of `internal/pkg/table/path.go` in v3.32.0 and v4.7.0
      using the links above. Follow changes in how path attributes are stored and
      copied. Which operation creates a copy, and is it really necessary?
  - title: "Test your hypothesis experimentally"
    text: |
      Do not stop at “probably this”. Write a microtest loading N routes and
      measuring `runtime.ReadMemStats`, change one thing, and run it again.
      A reproducible result beats ten guesses — exactly what we look for in
      an interview.
---

A service reports that GoBGP on a test host has grown to tens of gigabytes of
memory with several million routes, including [[srv6|SRv6]] SIDs. The question:
**a leak or normal usage?**

## Your task

1. Run GoBGP locally in a container or with `go run`. Load many routes using a gRPC API script or another instance.
2. Measure memory usage against route count. Plot it, even in a terminal.
3. Does it grow linearly? Does memory return after withdrawal?
4. Identify the code responsible for the largest share of usage, supported by numbers.
5. Propose a change. A sketch and estimated saving are enough; implementation is optional.

## Why this is a useful exercise

This is real work: no single right answer on Google, but measurement, a hypothesis,
and an experiment. Getting as far as step 3 with your own numbers is already much
more than “I read that Go has GC”.
