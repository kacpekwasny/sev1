---
title: "GoBGP zjada za dużo pamięci"
summary: "Prawdziwy problem z pracy: proces BGP rośnie i rośnie. Wyciek czy tak ma być?"
difficulty: trudne
time: "2-4 h"
tags: [go, gobgp, profilowanie, srv6]
notes: [frr-i-gobgp, srv6]
links:
  - title: "Notatki wewnętrzne: gobgp-srv6-memory (dostęp tylko z sieci Akamai)"
    url: "https://bits.linode.com/kkwasny/gobgp-srv6-memory"
  - title: "GoBGP v3.32.0 - table/path.go (starsza wersja)"
    url: "https://github.com/osrg/gobgp/blob/v3.32.0/internal/pkg/table/path.go#L1045-L1053"
  - title: "GoBGP v4.7.0 - table/path.go (nowsza wersja)"
    url: "https://github.com/osrg/gobgp/blob/v4.7.0/internal/pkg/table/path.go#L1048"
  - title: "Dokumentacja pprof"
    url: "https://pkg.go.dev/net/http/pprof"
hints:
  - title: "Zacznij od pomiaru, nie od czytania kodu"
    text: |
      Zanim zaczniesz szukać winnego w źródłach, zmierz. GoBGP potrafi wystawić
      `net/http/pprof`. Zrzuć stertę przy 100k i przy 1M tras:

      ```
      go tool pprof -http=:8081 http://localhost:6060/debug/pprof/heap
      ```

      Interesuje cię widok `inuse_space` pogrupowany po miejscu alokacji.
  - title: "Wyciek czy koszt własny?"
    text: |
      Wyciek to pamięć, która **nie zwalnia się po usunięciu tras**. Rozróżnisz to
      jednym eksperymentem: wgraj trasy, wycofaj je wszystkie, wymuś GC
      (`runtime.GC()` / `debug.FreeOSMemory()`) i zmierz ponownie. Jeżeli zużycie
      wraca do poziomu wyjściowego - nie masz wycieku, masz za drogą reprezentację
      jednej trasy.
  - title: "Policz, ile powinno zajmować"
    text: |
      Oszacuj z góry: ile bajtów *musi* zająć jedna trasa (prefiks, next-hop,
      atrybuty), pomnóż przez liczbę tras i porównaj z pomiarem. Jeżeli różnica jest
      kilkukrotna, szukaj duplikatów: te same atrybuty (`as-path`, `communities`,
      SID-y) trzymane osobno dla każdej ścieżki zamiast współdzielone.
  - title: "Porównaj wersje"
    text: |
      Zobacz te same fragmenty `internal/pkg/table/path.go` w v3.32.0 i v4.7.0
      (linki wyżej) i prześledź, co się zmieniło w sposobie trzymania i kopiowania
      atrybutów ścieżki. Pytanie do odpowiedzi: przy jakiej operacji powstaje kopia
      i czy na pewno jest potrzebna.
  - title: "Sprawdź swoją hipotezę eksperymentem"
    text: |
      Nie kończ na "chyba to to". Napisz mikrotest, który wgrywa N tras i mierzy
      `runtime.ReadMemStats`, zmień jedną rzecz i uruchom ponownie. Wynik, który
      da się powtórzyć, jest wart dziesięciu przeczuć - i dokładnie tego szukamy
      na rozmowie rekrutacyjnej.
---

Serwis raportuje, że proces GoBGP na hoście testowym urósł do kilkudziesięciu
gigabajtów pamięci przy kilku milionach tras, w tym tras z SID-ami
[[srv6|SRv6]]. Pada pytanie: **wyciek czy normalne zużycie?**

## Twoje zadanie

1. Postaw GoBGP lokalnie (kontener albo `go run`), wgraj mu dużo tras - możesz je
   wygenerować skryptem przez API gRPC albo drugą instancją.
2. Zmierz zużycie pamięci jako funkcję liczby tras. Narysuj wykres, choćby w
   terminalu.
3. Odpowiedz: czy rośnie liniowo? Czy wraca po wycofaniu tras?
4. Wskaż konkretne miejsce w kodzie, które odpowiada za największą część zużycia,
   i uzasadnij liczbami.
5. Zaproponuj zmianę. Nie musisz jej implementować - wystarczy szkic i oszacowanie,
   ile by dała.

## Dlaczego to jest dobre zadanie

Bo tak wygląda prawdziwa robota: nie ma jednej dobrej odpowiedzi w Google, jest za to
pomiar, hipoteza i eksperyment. Jeżeli dojdziesz choćby do punktu 3 z własnymi
liczbami - to już jest dużo więcej niż "przeczytałem, że Go ma GC".
