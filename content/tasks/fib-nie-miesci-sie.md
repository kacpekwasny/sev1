---
title: "300 tysięcy tras, 32 tysiące miejsca"
summary: "Zadanie projektowe: co zrobić, gdy tablica routingu nie mieści się w sprzęcie."
difficulty: srednie
time: "1-2 h"
tags: [bgp, projektowanie, fib]
notes: [fib-i-whiteboxy, bgp-podstawy, overlay]
hints:
  - title: "Podziel trasy na klasy"
    text: |
      Nie wszystkie trasy są równie ważne. Zacznij od podziału: trasy do maszyn w tej
      samej szafie, trasy wewnątrz centrum obliczeniowego, trasy do innych regionów,
      trasy do internetu. Dla której z tych klas naprawdę potrzebujesz dokładnego
      wpisu w sprzęcie?
  - title: "Default to też trasa"
    text: |
      Jeżeli cały ruch do internetu i tak wychodzi dwoma linkami, to zamiast 900
      tysięcy prefiksów wystarczy `0.0.0.0/0` i `::/0` z odpowiednim `local-pref`.
      Pytanie kontrolne: co tracisz? (Podpowiedź: wybór lepszego wyjścia i szybkie
      wykrycie, że sąsiad przestał widzieć kawałek świata.)
  - title: "Agregacja i to, co się pod nią chowa"
    text: |
      Szesnaście `/24` można rozgłosić jako jeden `/20` - ale tylko jeśli faktycznie
      wszystkie prowadzą tam samo. Co się stanie, gdy jeden z tych `/24` zniknie, a
      ty nadal rozgłaszasz agregat? To jest klasyczny sposób na czarną dziurę.
  - title: "Sprawdź, czy w ogóle wiesz, ile masz miejsca"
    text: |
      Żadne z powyższych nie ma sensu bez pomiaru. Jak sprawdzisz bieżące zajęcie
      TCAM na swojej platformie? Przy jakim progu chcesz dostać alert i dlaczego
      na pewno nie przy 100%?
---

Dostajesz whitebox z miejscem na **32 768** tras w sprzęcie. Twoja sieć widzi
**300 000** prefiksów i liczba ta rośnie o kilka procent rocznie. Wymiana sprzętu nie
wchodzi w grę w tym kwartale.

## Twoje zadanie

Napisz jedną stronę projektu (naprawdę jedną), która odpowiada na pytania:

1. Które trasy **muszą** być w sprzęcie, a które mogą zniknąć z FIB?
2. Jak wygląda twój filtr wejściowy? Napisz go jako pseudo-polityka albo konfiguracja
   FRR.
3. Co się dzieje, gdy mimo wszystko przekroczysz limit? Jak się o tym dowiesz
   **zanim** dowiedzą się klienci?
4. Jakie ryzyko wprowadza twoje rozwiązanie i jak je ograniczasz?

## Kryterium sukcesu

Nie ma jednej poprawnej odpowiedzi. Dobra odpowiedź nazywa **kompromis**: co
zyskujesz, co tracisz i w jakiej sytuacji twoje rozwiązanie zawiedzie. Dokładnie tak
wygląda projekt techniczny, który potem idzie na review do zespołu.

Kontekst: [[fib-i-whiteboxy]].
