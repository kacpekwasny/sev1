---
title: "Centrum obliczeniowe od środka"
summary: "Szafa, ToR, spine-leaf, redundancja - fizyczne wyobrażenie, na którym opiera się reszta."
tags: [dc, podstawy]
---

# Centrum obliczeniowe od środka

## Od dołu

- **Serwer** - 1U albo 2U, wsuwany w szafę na szynach.
- **Szafa (rack)** - 42U, w środku kilkadziesiąt serwerów i przełącznik na górze.
- **ToR (top of rack)** - przełącznik, do którego pod spodem wpina się cała szafa.
- **Rząd szaf, hala, budynek** - a wokół zasilanie, chłodzenie i światłowody.

## Topologia spine-leaf

```
        spine1     spine2     spine3
          |  \     /  |  \     /  |
          |   \   /   |   \   /   |
        leaf1      leaf2      leaf3     <- ToR
          |          |          |
       [szafa]    [szafa]    [szafa]
```

Każdy leaf łączy się z każdym spine. Dzięki temu droga między dowolnymi dwoma
serwerami ma tyle samo przeskoków, a przepustowość rośnie przez dokładanie spine'ów,
nie przez wymianę jednego wielkiego urządzenia. Ruch rozkłada się po równoległych
ścieżkach (ECMP).

Rysunek wyżej mieści się w pliku tekstowym i tyle mu wystarczy. Kable, porty, adresy
łączy i to, którędy naprawdę pójdzie pakiet, są do obejrzenia w
[[topologie/spine-leaf|interaktywnej wersji tej topologii]].

## Redundancja

Wszystko jest podwójnie: dwa zasilacze z dwóch torów, dwa uplinki do dwóch różnych
ToR-ów, dwa spine'y minimum. Zasada: **awaria pojedynczego elementu nie może wyłączyć
usługi**. To dlatego przy planowanych pracach da się wyłączyć pół sieci w środku dnia.

Cała reszta wykładów opiera się na tym obrazku - [[bgp-podstawy|routing]] między tymi
urządzeniami, a potem [[overlay]] ponad nim.

Powiązane: [[fib-i-whiteboxy]], [[gpu-clusters]], [[po-co-cloud]]
