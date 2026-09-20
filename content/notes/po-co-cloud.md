---
title: "Po co komu cloud"
summary: "Dlaczego firmy oddają swoje serwery komuś innemu - i kiedy to się nie opłaca."
tags: [cloud, podstawy]
---

# Po co komu cloud

Serwer da się kupić. Problemem nie jest sprzęt, tylko wszystko dookoła.

## Czego nie widać w cenie serwera

- **Prąd i chłodzenie** - szafa potrafi ciągnąć kilkanaście kW. Do tego zasilanie
  awaryjne, agregat, klimatyzacja z redundancją.
- **Łącza** - co najmniej dwóch operatorów, własne ASN, sesje [[bgp-podstawy|BGP]],
  ochrona przed DDoS.
- **Ludzie** - ktoś musi wymienić dysk o 3 w nocy i ktoś musi odebrać telefon.
- **Czas** - zamówienie sprzętu to tygodnie. Maszyna w cloudzie wstaje w minutę.

## Kiedy własne serwery mają sens

Gdy obciążenie jest stałe i przewidywalne, a skala wystarczająco duża, żeby zatrudnić
zespół. Wtedy rachunek potrafi wyjść na korzyść własnej infrastruktury - dlatego duże
firmy często mają jedno i drugie.

## Co to zmienia dla inżyniera sieci

Cloud oznacza, że klient dostaje **swoją** sieć na **wspólnym** sprzęcie. Adresacja
klientów nie może kolidować, ruch nie może się mieszać, a wszystko musi się dać
przestawić programowo. Stąd [[overlay]] i [[ip-sharing]].

Powiązane: [[centrum-obliczeniowe]]
