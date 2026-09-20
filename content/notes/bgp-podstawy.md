---
title: "BGP w pięć minut"
summary: "Sesje, prefiksy, atrybuty, wybór najlepszej ścieżki - minimum, żeby zrozumieć resztę."
tags: [networking, bgp]
---

# BGP w pięć minut

BGP to protokół, którym routery mówią sobie **jakie sieci potrafią dostarczyć**.
Trzyma internet w kupie, a w centrum obliczeniowym używa się go również wewnątrz.

## Sesje

Sesja BGP to zwykłe połączenie TCP na porcie 179 między dwoma routerami (peerami).
Po nawiązaniu wymieniają się prefiksami i od tego momentu wysyłają już tylko zmiany.

- **eBGP** - między różnymi systemami autonomicznymi (AS).
- **iBGP** - wewnątrz jednego AS.

## Co się rozgłasza

Prefiks (`10.0.0.0/24`) plus atrybuty, m.in.:

| atrybut | do czego |
|---|---|
| `next-hop` | dokąd wysłać pakiet |
| `as-path` | przez jakie AS-y trasa przeszła; chroni przed pętlą |
| `local-pref` | którą ścieżkę wolimy wewnątrz AS |
| `med` | sugestia dla sąsiada, którym wejściem wchodzić |
| `communities` | etykiety do polityk - nasz główny sposób sterowania ruchem |

## Wybór trasy

Gdy na ten sam prefiks przyjdzie kilka ofert, router idzie listą kryteriów po
kolei: najwyższy `local-pref`, potem najkrótszy `as-path`, potem `med`, potem eBGP
przed iBGP, potem najniższy koszt do next-hopa. Pierwsze kryterium, które rozstrzyga,
wygrywa.

## RIB vs FIB

To rozróżnienie wraca w każdym incydencie:

- **RIB** - wszystko, czego się nauczyliśmy, w pamięci procesu routingu.
- **FIB** - podzbiór wgrany do sprzętu, którym faktycznie przełączane są pakiety.

RIB może mieć miliony wpisów. FIB ma tyle, ile zmieści krzem - patrz
[[fib-i-whiteboxy]].

Implementacje, z którymi pracujemy: [[frr-i-gobgp]].

Powiązane: [[route-server]], [[overlay]]
