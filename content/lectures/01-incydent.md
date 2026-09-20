---
title: "Incydent, czyli jak się tu znaleźliśmy"
number: 1
date: "2026-11-01, 18:00"
place: "D6, sala 1.20"
status: najblizszy
summary: >
  Zaczynamy od prawdziwego Sev1, a potem cofamy się do początku: po co komu cloud,
  jak fizycznie wygląda centrum obliczeniowe z kartami GPU i czym właściwie zajmuje
  się network software engineer.
agenda:
  - minutes: 10
    title: "Incydent - jak się tu znaleźliśmy"
    desc: "Fabularny opis pierwszego incydentu, który od razu był Sev1."
    notes: [sev1-incydent]
  - minutes: 5
    title: "O czym będzie ta seria"
    desc: "Dwa wieczory: techniczne i nietechniczne. Cloud, DC, networking, ale też codzienna praca i rekrutacja."
  - minutes: 5
    title: "Po co te cloudy?"
    desc: "Dlaczego własna serwerownia to nie jest taka prosta sprawa."
    poll: cloud-po-co
    terms: [cloud, datacenter]
    notes: [po-co-cloud]
  - minutes: 10
    title: "Trzecia tabletka: network SWE w Akamai"
    desc: "Frontend, backend... i network SWE. Że można wybrać zupełnie inną ścieżkę."
  - minutes: 20
    title: "Compute - centrum obliczeniowe od środka"
    desc: "Serwery, szafy, topologia, redundancja, typy boltów."
    notes: [centrum-obliczeniowe]
    topologies: [spine-leaf]
    poll: dc-redundancja
    terms: [datacenter, redundancy, bgp, bonding]
  - minutes: 15
    title: "Datacentery GPU"
    desc: "Sieć, która musi nadążyć za kartami. Adres per interfejs zamiast loopbacka."
    notes: [gpu-clusters]
    poll: gpu-adresacja
    terms: [gpu, nic, loopback]
  - minutes: 20
    title: "Day in a life of a Network SWE"
    desc: "Miesiąc pracy: nowe priorytety, incydenty, planingi, retro, ile linii kodu."
    notes: [dzien-z-zycia]
    tasks: [gobgp-pamiec]
  - minutes: 5
    title: "Pytania"
---

Pierwszy z dwóch wieczorów. Nie trzeba nic wiedzieć wcześniej - zaczynamy od zera i od
konkretnej historii.

Jeżeli chcesz przyjść przygotowany, przeczytaj [[sev1-incydent]] i [[po-co-cloud]].
Reszta materiałów pojawia się tutaj po wykładzie.
