---
title: "Sev1 - anatomia incydentu"
summary: "Czym jest Sev1, jak wygląda pierwsza godzina i dlaczego to nie jest historia o winie."
tags: [praca, incydenty]
---

# Sev1 - anatomia incydentu

**Sev1** (severity 1) to najwyższa kategoria incydentu: coś, co dotyka klientów na
dużą skalę i nie może poczekać do rana.

## Pierwsza godzina

1. **Ktoś to zauważa** - alert, telefon od zespołu obok albo klient.
2. **Incident commander** - jedna osoba pilnuje procesu, nie debuguje.
3. **Mitygacja przed diagnozą** - najpierw przywracamy ruch, dopiero potem dochodzimy,
   co się stało. Rollback jest zwykle szybszy niż zrozumienie.
4. **Kanał i timeline** - wszystko zapisane, bo za trzy dni nikt nie będzie pamiętał
   kolejności zdarzeń.

## Co naprawdę boli

Rzadko pojedynczy bug. Zwykle: zmiana wypuszczona w piątek + brakujące ograniczenie +
mechanizm, który przy awarii *wzmacnia* problem zamiast go tłumić. Zobacz
[[fib-i-whiteboxy]] - przepełniony FIB to klasyczny przykład: urządzenie nie pada,
tylko zaczyna po cichu gubić trasy.

## Postmortem bez winnych

Po incydencie piszemy postmortem: co się stało, co zadziałało, co nie, jakie akcje
naprawcze. **Blameless** - nie dlatego, że jesteśmy mili, tylko dlatego, że w kulturze
szukania winnego ludzie przestają zgłaszać błędy wcześnie.

Powiązane: [[dzien-z-zycia]], [[centrum-obliczeniowe]]
