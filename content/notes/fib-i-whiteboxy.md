---
title: "Whiteboxy i za mały FIB"
summary: "Dlaczego przełącznik za 30 tysięcy nie mieści tablicy routingu i co się z tym robi."
tags: [networking, sprzet]
---

# Whiteboxy i za mały FIB

**Whitebox** to przełącznik bez firmware'u producenta: standardowy sprzęt (często na
układach Broadcoma) plus system operacyjny, który wybieramy sami - np. SONiC z
[[frr-i-gobgp|FRR]]. Taniej, elastyczniej, ale cała odpowiedzialność jest po naszej
stronie.

## Twarde ograniczenie

Pakiety przełącza układ ASIC, a jego tablica ([[bgp-podstawy|FIB]]) siedzi w drogiej,
szybkiej pamięci TCAM. Ona ma **stały, niewielki rozmiar** - rzędu dziesiątek tysięcy
wpisów. Tablica BGP w internecie to dziś ponad 900 tysięcy prefiksów IPv4.

## Co się dzieje po przepełnieniu

Najgorsze jest to, że nic nie wybucha. Zależnie od platformy:

- nadmiarowe trasy lądują tylko w RIB i nigdy nie trafiają do sprzętu,
- albo ruch dla nich idzie do CPU (*punt*), które natychmiast się zapycha,
- albo trasa po cichu znika i pakiety lecą defaultem w złą stronę.

Objaw: "część ruchu działa, część nie, a `show bgp` pokazuje, że wszystko jest OK".

## Jak sobie radzimy

1. **Filtrowanie na wejściu** - nie przyjmujemy tego, czego i tak nie użyjemy.
2. **Agregacja** - jeden `/20` zamiast szesnastu `/24`.
3. **Default route** - konkrety lokalnie, reszta świata jednym wpisem.
4. **Overlay** - trasy klientów w ogóle nie trafiają do sprzętu, patrz [[overlay]].
5. **Monitoring zajętości TCAM** - alert przy 80%, nie przy 100%.

Zadanie: [[zadania/fib-nie-miesci-sie|300k tras, 32k miejsca]].

Powiązane: [[centrum-obliczeniowe]], [[sev1-incydent]]
