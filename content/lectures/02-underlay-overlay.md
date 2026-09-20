---
title: "Underlay, overlay i drabinka w Akamai"
number: 2
date: "2026-11-08, 18:00"
place: "D6, sala 1.20"
status: planowany
summary: >
  Jak pakiet trafia z jednej maszyny wirtualnej do drugiej, dlaczego sprzęt za grube
  pieniądze nie mieści całej tablicy routingu - a na koniec szczerze o tym, jak się
  tu wchodzi i co dzieje się od interview do seniora.
agenda:
  - minutes: 5
    title: "Co było ostatnio"
  - minutes: 15
    title: "Routing między urządzeniami - underlay"
    desc: "Whiteboxy, ograniczony FIB, co robimy, gdy tras jest więcej niż miejsca."
    notes: [bgp-podstawy, fib-i-whiteboxy]
    poll: fib-overflow
  - minutes: 15
    title: "Routing między VMkami - overlay"
    desc: "Analogia z listonoszem i pocztą: adres na kopercie a adres na paczce w środku."
    notes: [overlay]
    poll: overlay-jak
  - minutes: 10
    title: "BGP route server, czyli plotkara"
    desc: "Dlaczego nie łączymy wszystkich ze wszystkimi."
    notes: [route-server]
    poll: route-server-sesje
    tasks: [route-server-lab]
  - minutes: 10
    title: "IP Sharing od technicznej strony"
    desc: "Najpierw prosta sprawa, potem VPC IP Sharing - już ciekawsza."
    notes: [ip-sharing]
  - minutes: 10
    title: "IPv6 i SRv6"
    desc: "Routing zapisany w adresie. Co to jest SID i dlaczego to wygodne."
    notes: [ipv6, srv6]
    poll: srv6-sid
  - minutes: 5
    title: "Gościnnie: QA/SDET"
    desc: "Testowanie, debugowanie, reprodukcje - i to, że tam też programuje się baaardzo dużo."
    notes: [qa-sdet]
  - minutes: 10
    title: "Drabinka w Akamai"
    desc: "Że jest coś więcej niż junior/mid/senior: ścieżka inżynierska, architekcka, SRE, menedżerska."
    notes: [drabinka]
  - minutes: 10
    title: "Od interview do seniora"
    desc: "Szukamy kogoś, kto kombinuje i się nie poddaje. Przykładowe pytania z rozmowy."
    notes: [rozmowa-o-prace]
    poll: rekrutacja-wrazenie
  - minutes: 5
    title: "Co dalej - staże i zadania"
    tasks: [gobgp-pamiec, fib-nie-miesci-sie, route-server-lab]
---

Drugi wieczór: najpierw najbardziej techniczna część serii, potem to, o co i tak
zawsze ktoś pyta na korytarzu po wykładzie.

Warto wcześniej zerknąć na [[bgp-podstawy]] - reszta buduje się na tym. Część
o karierze jest niezależna od technicznej, więc można przyjść tylko na ten wykład.

Po wykładzie można spróbować [[route-server-lab|zadania z route serverem]] na własnym
laptopie.
