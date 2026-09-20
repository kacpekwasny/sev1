---
title: "Dzień (i miesiąc) z życia Network SWE"
summary: "Ile się programuje, ile czyta, ile gasi pożary - i skąd się biorą priorytety."
tags: [praca]
---

# Dzień (i miesiąc) z życia Network SWE

## Typowy miesiąc

| tydzień | co się dzieje |
|---|---|
| 1 | planowanie sprintu, projekt nowej funkcji, przegląd cudzych zmian |
| 2 | pisanie kodu i testów, lab, przerwane przez incydent |
| 3 | dokończenie incydentu, postmortem, akcje naprawcze, stary task z backlogu |
| 4 | wdrożenie etapami, obserwacja metryk, retrospektywa |

Plan jest zawsze, ale rzadko przeżywa zderzenie z rzeczywistością. Umiejętność, której
nie uczą na studiach: **decydowanie, czego nie zrobić w tym tygodniu**.

## Ile się właściwie programuje

Mniej, niż się wydaje, i to jest dobra wiadomość. Zmiana w [[frr-i-gobgp|GoBGP]] czy
w naszym serwisie to często kilkadziesiąt linii - poprzedzonych dwoma dniami czytania
kodu, RFC i logów. Największe zmiany to zwykle **usunięcie** czegoś.

Do tego dochodzi kod, którego nikt nie liczy jako "prawdziwego": narzędzia
diagnostyczne, generatory topologii do labów, skrypty do porównywania RIB przed i po.

## Rytm zespołu

- **daily** - 10 minut, głównie po to, żeby ktoś powiedział "mam to samo, pogadajmy",
- **planning** - co bierzemy i dlaczego akurat to,
- **retro** - co nas wkurzało; sens ma tylko wtedy, gdy coś z tego wynika,
- **on-call** - dyżur; patrz [[sev1-incydent]].

## Co jest naprawdę trudne

Nie algorytmy. Trudne jest: zrozumieć system, którego nikt w całości nie zna, zmienić
go bez wyłączania, i udowodnić, że zmiana działa - zanim zobaczy ją klient.

Powiązane: [[drabinka]], [[qa-sdet]], [[rozmowa-o-prace]]
