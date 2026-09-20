---
title: "Cloud networking: listonosz, plotkara i za mały FIB"
number: 2
date: "2026-10-22, 18:00"
place: "D6, sala 1.20"
status: planowany
summary: >
  Jak pakiet trafia z jednej maszyny wirtualnej do drugiej, dlaczego sprzęt za grube
  pieniądze nie mieści całej tablicy routingu i skąd się bierze BGP route server.
agenda:
  - minutes: 5
    title: "Co było ostatnio"
  - minutes: 20
    title: "Routing między urządzeniami"
    desc: "Whiteboxy, ograniczony FIB, co robimy, gdy tras jest więcej niż miejsca."
    notes: [bgp-podstawy, fib-i-whiteboxy]
    poll: fib-overflow
  - minutes: 20
    title: "Routing między VMkami - overlay"
    desc: "Analogia z listonoszem i pocztą: adres na kopercie a adres na paczce w środku."
    notes: [overlay]
    poll: overlay-jak
  - minutes: 15
    title: "BGP route server, czyli plotkara"
    desc: "Dlaczego nie łączymy wszystkich ze wszystkimi."
    notes: [route-server]
    poll: route-server-sesje
    tasks: [route-server-lab]
  - minutes: 20
    title: "IP Sharing od technicznej strony"
    desc: "Najpierw prosta sprawa, potem VPC IP Sharing - już ciekawsza."
    notes: [ip-sharing]
  - minutes: 10
    title: "Drabinka w Akamai"
    desc: "Że jest coś więcej niż junior/mid/senior: ścieżka inżynierska, architekcka, SRE, menedżerska."
    notes: [drabinka]
---

Najbardziej techniczny wykład z serii. Warto wcześniej zerknąć na [[bgp-podstawy]] -
reszta buduje się na tym.

Po wykładzie można spróbować [[route-server-lab|zadania z route serverem]] na własnym
laptopie.
