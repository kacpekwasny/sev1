---
title: "Postaw własny route server"
summary: "Lab na laptopie: cztery routery, jeden route server, zero pełnej siatki."
difficulty: latwe
time: "1-2 h"
tags: [bgp, lab, frr, gobgp]
notes: [route-server, bgp-podstawy, frr-i-gobgp]
links:
  - title: "GoBGP - getting started"
    url: "https://github.com/osrg/gobgp/blob/master/docs/sources/getting-started.md"
  - title: "FRRouting - dokumentacja BGP"
    url: "https://docs.frrouting.org/en/latest/bgp.html"
  - title: "containerlab - laby sieciowe w kontenerach"
    url: "https://containerlab.dev/"
hints:
  - title: "Najpierw dwa routery, nie pięć"
    text: |
      Zestaw jedną sesję BGP między dwoma kontenerami FRR i rozgłoś jeden prefiks.
      Dopiero gdy to działa, dokładaj kolejne. Większość czasu w labach schodzi na
      literówki w adresach, nie na routing.
  - title: "Sesja nie wstaje - kolejność sprawdzania"
    text: |
      1. Czy hosty w ogóle się pingują? 2. Czy port 179 jest otwarty
      (`ss -tlnp`, iptables w kontenerze)? 3. Czy zgadzają się numery AS po obu
      stronach? 4. `show bgp neighbor` - w jakim stanie utknęła sesja (Active,
      Connect, OpenSent)? Każdy stan mówi coś innego.
  - title: "Trasa jest w RIB, ale nie w jądrze"
    text: |
      Sprawdź `show bgp ipv4 unicast` kontra `ip route`. Najczęstszy powód:
      niedostępny `next-hop`. Route server zwykle zostawia oryginalny next-hop
      nadawcy - jeśli odbiorca nie ma do niego drogi, trasa zostaje odrzucona.
  - title: "Rozszerzenie dla ambitnych"
    text: |
      Zamiast statycznej konfiguracji, napisz mały program w Go, który przez API
      gRPC GoBGP wstrzykuje trasy. To już jest dosłownie to, co robimy w pracy -
      serwis generuje trasy, a BGP jest tylko transportem.
---

Zbuduj mały lab, w którym cztery routery wymieniają trasy przez jeden **route
server**, zamiast łączyć się każdy z każdym.

## Twoje zadanie

1. Postaw pięć kontenerów: cztery FRR i jeden GoBGP jako route server
   (albo wszystko na FRR - jak wolisz). Najwygodniej przez `containerlab`, ale
   zwykły `docker compose` też wystarczy.
2. Każdy router ma sesję **wyłącznie** z route serverem.
3. Każdy rozgłasza swój prefiks, np. `10.0.X.0/24`.
4. Sprawdź, że router 1 widzi trasę do prefiksu routera 4, i że next-hop prowadzi
   bezpośrednio do routera 4, a nie do route servera.
5. Wyłącz route server. Co się dzieje z trasami i po jakim czasie?

## Pytania do odpowiedzi

- Ile masz sesji BGP? Ile miałbyś w pełnej siatce dla tych samych czterech routerów?
  A dla stu?
- Co się zmieni, gdy dostawisz drugi route server?

## Rezultat

Plik `docker-compose.yml` albo topologia `containerlab` plus krótkie README z
wynikami `show bgp summary`. Taki lab jest świetnym punktem do rozmowy o stażu -
własna, działająca topologia mówi więcej niż linijka w CV.

Kontekst: [[route-server]].
