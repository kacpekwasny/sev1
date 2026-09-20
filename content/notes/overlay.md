---
title: "Overlay, czyli listonosz i paczka"
summary: "Jak pakiet jednej VMki dociera do drugiej, choć sieć fizyczna nic o nich nie wie."
tags: [networking, overlay]
---

# Overlay, czyli listonosz i paczka

## Analogia

Wysyłasz paczkę do kolegi z akademika. Na kopercie piszesz adres **akademika**, nie
numer jego pokoju - poczta o pokojach nic nie wie. Dopiero na portierni ktoś patrzy
na karteczkę w środku i zanosi paczkę pod właściwe drzwi.

- koperta = nagłówek zewnętrzny, adresy **hostów** (underlay),
- paczka w środku = oryginalny pakiet VMki (overlay),
- portiernia = host docelowy, który odpakowuje i wrzuca pakiet do właściwej VMki.

## Po co to

- Adresacja klienta jest **jego sprawą** - dwóch klientów może mieć to samo `10.0.0.0/8`.
- Sieć fizyczna zna tylko adresy hostów, więc jej [[fib-i-whiteboxy|FIB]] pozostaje mały.
- VMkę można przenieść na inny host bez zmiany jej adresu - zmienia się tylko
  zewnętrzna koperta.

## Czym się pakuje

VXLAN, Geneve, GRE, a u nas coraz częściej [[srv6|SRv6]]. Różnią się szczegółami
nagłówka i tym, ile informacji da się w nim przemycić, ale idea jest ta sama.

## Skąd host wie, dokąd zaadresować kopertę

Ktoś musi rozgłosić "VMka o adresie X siedzi na hoście Y". Robi to control plane -
BGP z rodziną EVPN albo nasz własny serwis. Żeby każdy host nie musiał gadać z każdym
innym, pośredniczy [[route-server]].

Powiązane: [[bgp-podstawy]], [[ip-sharing]]
