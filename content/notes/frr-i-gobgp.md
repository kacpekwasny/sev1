---
title: "FRR i GoBGP"
summary: "Dwie implementacje BGP, których używamy na co dzień, i po co nam obie."
tags: [networking, bgp, narzedzia]
---

# FRR i GoBGP

## FRR (FRRouting)

Klasyczny stos routingu w C: osobne demony (`bgpd`, `zebra`, `staticd`) i CLI
przypominające sprzęt Cisco. Wgrywa trasy do jądra Linuksa przez `zebra`.

```
vtysh -c "show bgp ipv6 unicast summary"
vtysh -c "show bgp ipv6 unicast 2001:db8::/48"
```

Używamy go tam, gdzie chcemy pełnego, dojrzałego BGP na hoście.

## GoBGP

BGP napisane w Go, sterowane przez gRPC - nie ma konfiguracji "na żywo" w CLI,
jest API. To zmienia sposób myślenia: sesja BGP staje się elementem programu, a nie
elementem konfiguracji urządzenia.

```
gobgp global rib -a ipv6
gobgp neighbor 2001:db8::1 adj-in
```

Nadaje się świetnie na [[route-server|route server]] i wszędzie tam, gdzie trasy
generuje jakiś nasz serwis.

## Dlaczego obie

FRR jest bogatszy funkcjonalnie, GoBGP łatwiej wpiąć w kod i testy. W praktyce jeden
gada z drugim, a większość pracy to sprawdzanie, czy na pewno rozumieją się tak samo
- np. przy rozszerzeniach [[srv6|SRv6]].

Zadanie oparte na prawdziwym problemie: [[zadania/gobgp-pamiec|GoBGP je za dużo pamięci]].

Powiązane: [[bgp-podstawy]], [[dzien-z-zycia]]
