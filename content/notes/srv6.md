---
title: "SRv6 - routing zapisany w adresie"
summary: "SID, lista segmentów i po co komu source routing w 2026 roku."
tags: [networking, srv6, ipv6]
---

# SRv6 - routing zapisany w adresie

**Segment Routing over IPv6** to pomysł, żeby ścieżkę pakietu zapisać w samym
pakiecie, zamiast utrzymywać stan w każdym routerze po drodze.

## SID

**SID** (Segment Identifier) to zwykły adres [[ipv6|IPv6]], ale traktowany jako
instrukcja. Dzieli się na części:

```
 2001:db8:  aaaa:    0100  ::
 \_______/  \____/   \___/
  locator   funkcja  argument
```

- **locator** - routowalny prefiks, prowadzi do konkretnego węzła,
- **funkcja** - co ten węzeł ma zrobić (np. `End.DT4`: odpakuj i przekaż do tablicy
  VRF klienta),
- **argument** - dodatkowy kontekst dla tej funkcji.

Ładne jest to, że sieć pośrednia nie musi nic wiedzieć o SRv6. Widzi zwykły adres
IPv6 i routuje go do locatora.

## Lista segmentów

Gdy trzeba wymusić trasę przez kilka punktów, pakiet dostaje nagłówek SRH z listą
SID-ów i wskaźnikiem, który z nich jest aktualny. Każdy kolejny węzeł zdejmuje swój
segment i przekazuje dalej.

## Po co nam to

- [[overlay]] bez osobnego protokołu enkapsulacji - IPv6 wystarcza,
- inżynieria ruchu: "ten ruch ma iść tędy", bez stanu w środku sieci,
- mniej rzeczy do utrzymania niż przy MPLS.

## Gdzie boli

Rozgłaszanie SID-ów idzie przez [[bgp-podstawy|BGP]] i implementacje różnią się
szczegółami kodowania - dlatego tyle czasu schodzi na sprawdzanie, czy
[[frr-i-gobgp|FRR i GoBGP]] rozumieją to samo. Dochodzi MTU: każdy dodatkowy nagłówek
zjada miejsce na dane.

Powiązane: [[gpu-clusters]], [[dzien-z-zycia]]
