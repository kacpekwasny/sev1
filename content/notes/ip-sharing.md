---
title: "IP Sharing"
summary: "Jeden adres, wiele maszyn - prosta wersja i ta trudniejsza, w VPC."
tags: [networking, cloud]
---

# IP Sharing

## Prosta wersja

Klient ma dwie maszyny i chce, żeby ten sam adres publiczny obsługiwała raz jedna,
raz druga - na wypadek awarii. Adres jest **przypisany** do jednej z nich, a przy
przełączeniu trasa do niego jest rozgłaszana z innego miejsca.

Co musi zadziałać:

- host, który przejmuje adres, ogłasza go (BGP albo mechanizm typu VRRP),
- stary przestaje go ogłaszać, inaczej ruch rozjeżdża się na dwie strony,
- sąsiedzi muszą zauważyć zmianę **szybko** - to głównie kwestia czasów zbieżności.

Trudność nie leży w rozgłoszeniu adresu, tylko w tym, żeby w żadnej chwili nie było
dwóch właścicieli i żeby przerwa była krótsza niż cierpliwość klienta.

## VPC IP Sharing

W [[overlay|VPC]] adres nie jest już adresem hosta, tylko adresem wewnątrz sieci
klienta. Ten sam adres może istnieć równolegle u wielu klientów, a maszyna może go
przejąć na innym hoście, w innej szafie, czasem w innym regionie.

Do rozstrzygnięcia jest wtedy:

- kto jest właścicielem adresu **w danej chwili** i skąd reszta o tym wie,
- jak wygląda enkapsulacja, gdy adres wewnętrzny nie zmienia się, a zewnętrzny tak,
- co zrobić z ruchem w locie w trakcie przełączenia,
- jak to przetestować, skoro błąd objawia się dopiero pod obciążeniem.

To jest ten moment, w którym z "prostej sprawy" robi się kilka tygodni pracy i
porządny zestaw testów - patrz [[qa-sdet]].

Powiązane: [[po-co-cloud]], [[route-server]]
