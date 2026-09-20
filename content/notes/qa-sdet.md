---
title: "QA i SDET - nie to, co myślisz"
summary: "Testowanie systemu rozproszonego to programowanie. Z tymi samymi widełkami."
tags: [praca, testy]
---

# QA i SDET - nie to, co myślisz

## Skąd nieporozumienie

"QA" kojarzy się z klikaniem po formularzach. W systemie, w którym trzeba postawić
kilkanaście routerów, zasymulować awarię łącza i sprawdzić, czy ruch wrócił w
300 ms - klikaniem nic się nie zrobi.

## Ścieżka

**Manual QA → QA automatyzujący → SDET** (Software Development Engineer in Test).
SDET pisze kod na pełny etat: frameworki testowe, symulatory topologii, narzędzia do
porównywania stanu przed i po zmianie. W Akamai to ta sama drabinka i te same widełki
co dla SWE - patrz [[drabinka]].

## Co naprawdę robi SDET w sieci

- buduje lab, w którym da się odtworzyć awarię z produkcji (najtrudniejsza część),
- pisze testy, które puszczają [[frr-i-gobgp|FRR i GoBGP]] przeciwko sobie i
  sprawdzają, czy widzą te same trasy,
- szuka przypadków brzegowych, o których autor nie pomyślał: flap sesji w trakcie
  konwergencji, MTU o bajt za małe, restart w połowie aktualizacji,
- automatyzuje **reprodukcję** - bo błąd, którego nie umiesz powtórzyć, nie jest
  naprawiony.

## Dlaczego to ciekawe

Żeby zepsuć system w sensowny sposób, trzeba go rozumieć lepiej niż osoba, która go
napisała. Najtrudniejsze błędy w [[sev1-incydent|incydentach]] to nie literówki,
tylko sytuacje, których nikt nie przewidział - a to jest dokładnie ten zawód.

Powiązane: [[dzien-z-zycia]], [[ip-sharing]]
