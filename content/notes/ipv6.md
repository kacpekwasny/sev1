---
title: "IPv6 - co warto wiedzieć"
summary: "Nie chodzi o to, że adresów jest więcej. Chodzi o to, co można z nimi zrobić."
tags: [networking, ipv6]
---

# IPv6 - co warto wiedzieć

## Podstawy w kilku punktach

- Adres ma 128 bitów, zapisywany szesnastkowo: `2001:db8:1::5`.
- Typowa sieć to `/64`, przydział dla klienta często `/48` albo `/56`.
- Nie ma ARP - jest NDP (Neighbor Discovery) na ICMPv6. Blokowanie ICMPv6 psuje sieć.
- Nie ma fragmentacji na routerach - nadawca musi ogarnąć PMTUD.
- Interfejs ma zwykle kilka adresów naraz (link-local `fe80::/10` + globalne).

## Dlaczego to dla nas ważne

W skali centrum obliczeniowego IPv4 po prostu się kończy - i to nie teoretycznie.
Ale ciekawsze jest co innego: **128 bitów to dużo miejsca na informację**. Adres
przestaje być tylko "dokąd" i może być również "co zrobić".

Na tym stoi [[srv6]]: pierwsza część adresu wskazuje węzeł, dalsza mówi mu, jaką
operację wykonać.

## Co gryzie w praktyce

- Narzędzia i skrypty pisane kiedyś pod IPv4 (`inet_aton`, parsowanie regexem).
- Podwójna konfiguracja polityk: reguła dodana tylko dla jednej rodziny adresów to
  klasyk [[sev1-incydent|incydentu]].
- Ludzie, którzy "widzieli IPv6 na wykładzie" i mają nadzieję, że się nie przyda.

Powiązane: [[bgp-podstawy]], [[gpu-clusters]]
