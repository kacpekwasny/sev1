---
title: "Route server, czyli plotkara"
summary: "Dlaczego nie łączymy każdego z każdym i co robi za nas jeden dobrze poinformowany węzeł."
tags: [networking, bgp]
---

# Route server, czyli plotkara

## Problem pełnej siatki

Gdy każdy host ma sesję [[bgp-podstawy|BGP]] z każdym innym, liczba sesji rośnie
kwadratowo: `n(n-1)/2`.

| hostów | sesji |
|---|---|
| 10 | 45 |
| 100 | 4 950 |
| 1000 | 499 500 |

Przy tysiącu hostów to pół miliona sesji TCP do utrzymania i do ponownego zestawienia
po każdym restarcie. Nie da się.

## Rozwiązanie: jedna plotkara

Każdy gada tylko z **route serverem**. Mówi mu, co wie, a on rozsyła to reszcie.
Sesji jest `n`, nie `n(n-1)/2`.

```
   host1 ─┐        ┌─ host3
          ├─ RS ───┤
   host2 ─┘        └─ host4
```

Dokładnie tak działa plotkara: nie musisz znać wszystkich, wystarczy, że powiesz
jednej właściwej osobie.

## Czym różni się od zwykłego routera

Route server **nie przełącza ruchu** - siedzi obok ścieżki danych i tylko rozdaje
informacje. Dlatego zwykle zachowuje oryginalny `next-hop` i nie dokłada się do
`as-path`. U nas najczęściej stoi na [[frr-i-gobgp|GoBGP]], bo trasy generuje mu nasz
własny serwis.

## Czym płacimy

Pojedynczy punkt, przez który przechodzi wszystko - więc stoją co najmniej dwa,
a hosty trzymają sesje do obu. Trzeba też uważać na to, kto co komu rozgłasza:
błędna polityka na route serverze rozjeżdża się natychmiast po całej sieci.

Zadanie: [[zadania/route-server-lab|postaw własny route server]].

Powiązane: [[overlay]], [[sev1-incydent]]
