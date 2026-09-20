---
title: "Klastry GPU i sieć, która musi nadążyć"
summary: "Dlaczego przy trenowaniu modeli sieć staje się wąskim gardłem i co z tego wynika dla adresacji."
tags: [networking, gpu, dc]
---

# Klastry GPU i sieć, która musi nadążyć

## Na czym polega różnica

Zwykły ruch w centrum obliczeniowym jest nierównomierny i wybaczający - pakiet może
się zgubić, TCP go powtórzy. Trening dużego modelu wygląda inaczej: tysiące GPU
liczą krok, a potem **wszystkie naraz** wymieniają się wynikami (all-reduce).

Konsekwencje:

- ruch jest synchroniczny i ogromny - setki gigabitów na węzeł,
- cały klaster czeka na najwolniejszy transfer, więc opóźnienie ogona jest ważniejsze
  niż średnia,
- zgubiony pakiet i retransmisja potrafią wstrzymać krok obliczeń.

Dlatego używa się RDMA (RoCE) i sieci bezstratnej, a nie zwykłego TCP po zwykłym
Ethernecie.

## Adres per interfejs, nie loopback

Zwykle hostowi wystarczy jeden adres na loopbacku, a sieć sama wybiera interfejs.
W klastrze GPU jest odwrotnie: karta sieciowa jest przypisana do konkretnego GPU
(najlepiej na tej samej magistrali PCIe), więc **chcemy jawnie powiedzieć, którym
NIC-iem lecimy**.

Adres per interfejs daje:

- przewidywalne rozłożenie ruchu na wiele równoległych ścieżek,
- możliwość wskazania w aplikacji konkretnej karty,
- czytelną diagnostykę: widać, który link się zapycha.

Kosztem jest więcej adresów i więcej sesji [[bgp-podstawy|BGP]] - wracamy do
[[fib-i-whiteboxy|rozmiaru FIB]] i do [[route-server|route serwera]].

Powiązane: [[centrum-obliczeniowe]], [[ipv6]]
