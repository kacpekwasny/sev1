# Jak rozpętałem drugą Sev1 — strona wykładów

Strona towarzysząca serii otwartych wykładów na WIET AGH. Materiały, notatki w stylu
Obsidiana, zadania z podpowiedziami i interaktywna część na żywo dla sali.

Go + htmx + SSE. Bez frameworka frontendowego i bez bazy danych — cała treść to pliki
markdown, a stan wykładu żyje w pamięci procesu.

## Uruchomienie

```sh
go run . -dev                 # http://localhost:8080, przeładowuje treść przy F5
PANEL_TOKEN=cośtajnego go run .   # tryb produkcyjny
```

Panel prowadzącego: `http://localhost:8080/panel?token=sev1` (domyślny token, gdy nie
ustawiono `PANEL_TOKEN`).

```sh
go test ./...                 # testy renderują każdą stronę i sprawdzają linki
go build .                    # jeden plik binarny, treść www w środku
```

Flagi: `-addr :8080`, `-content content`, `-dev`.

## Co gdzie leży

```
content/lectures/*.md   wykłady: metadane + agenda (YAML) + opis (markdown)
content/notes/*.md      notatki z linkami [[tak]] - to samo, co w vaulcie
content/tasks/*.md      zadania: treść + lista podpowiedzi w nagłówku
content/topologies/*.yaml  sieci rysowane na stronie: urządzenia + reguły kablowania
content/polls.yaml      pytania rzucane sali w trakcie wykładu

internal/content        wczytywanie markdownu, wikilinki, graf, pakowanie vaulta
internal/live           stan na żywo: ankiety, pytania z sali, nastrój
internal/web            trasy HTTP, szablony, SSE

web/templates           base.html + pages/ + partials/ (fragmenty dla htmx i SSE)
web/static              CSS, graf notatek, htmx i Poppins (lokalnie, bez CDN), og.png
design/                 plakaty z Canvy - źródło stylu strony
```

## Skąd się wziął wygląd

Strona jest ubrana w plakaty z `design/`, żeby ktoś, kto widział plakat na korytarzu,
poznał tę samą serię po wejściu na stronę. Z plakatu wzięte są cztery kolory
(granat tła `#0c203b`, biel, błękit Akamai `#00a4eb`, jasny szary `#ced2d8` na daty),
krój **Poppins** i sposób składania nagłówków: wersaliki z szeroką spacją.

Kolory siedzą w `:root` w `web/static/app.css` — zmiana palety to zmiana tych kilku
linijek. Poppins leży w `web/static/vendor/fonts/` jako trzy pliki `.woff2` po ~9 kB
(licencja OFL, obok), przycięte do znaków łacińskich z polskimi — żadnego CDN-u,
bo na sali wifi bywa różnie.

Dwie rzeczy, których strona z plakatu nie bierze: pomarańczowy `--accent-2`, bo
interfejs musi umieć odróżnić „uwaga, to teraz" od zwykłego linku, a plakat ma tylko
jeden akcent; i wersaliki w długich tytułach wykładów, bo czyta się je wtedy wolniej.

## Dwie strony na wejściu

`/` to **wejściówka**: plakat przeniesiony na ekran. Tytuł, logo, hasła, terminy,
jedno zdanie o sali i przycisk. Nic więcej — kto zeskanował kod QR na korytarzu, ma
zobaczyć to samo, na co przed chwilą patrzył, a nie spis treści. Ta strona jedyna
chodzi w granacie z plakatu i bez stopki (`Bare` w danych szablonu).

`/wyklady/` to **strona z materiałami**, czyli to, co było wcześniej stroną główną:
najbliższy termin, program, zadania i notatki.

Terminy na wejściówce biorą się z nagłówków wykładów (`date:`), a najbliższy termin
na `/wyklady/` — z tego oznaczonego `status: najblizszy`. Po każdym wykładzie przestaw
go na `odbyty`, a następnemu wpisz `najblizszy`. Testy `TestEntryPageIsThePoster`
i `TestHubHasTheMaterials` pilnują, żeby te dane faktycznie były na stronach; ten
pierwszy sprawdza też, że wejściówce nie przyrosła treść z `/wyklady/`.

Logo w `web/static/akamai.png` jest wycięte z plakatu i odtłoczone od granatu, więc
leży poprawnie na każdym ciemnym tle.

Link wklejony na grupę pokazuje podgląd z `web/static/og.png` (1200×630). Leżący tam
plik jest złożony z elementów plakatu, ale w poziomie, bo plakat jest 4:5 i w podglądzie
linku zostałby przycięty. Jak zrobisz w Canvie wersję poziomą — podmień plik, nic więcej
nie trzeba zmieniać.

## Część interaktywna

**Zaczynamy.** Pierwszy przełącznik w panelu ogłasza, że wykład trwa teraz. Nie odblokowuje
niczego — sala mogła głosować i pisać także wcześniej — zapala tylko pulsującą czerwoną
kropkę obok „Na żywo" w menu, a menu jest na każdej stronie. Ktoś, kto akurat czyta notatki,
widzi po niej, że warto przejść na `/live/`; po najechaniu kropka rozwija się w czerwony
napis *live*. Podstrony bez strumienia SSE (notatki, zadania) dopytują o ten jeden bit co
20 sekund — przy wykładzie trwającym półtorej godziny to tańsze niż otwieranie strumienia
wszędzie.

**Ankiety.** W agendzie wykładu wpisujesz `poll: fib-overflow`. W trakcie wykładu
wybierasz to pytanie w `/panel`, a sala widzi je natychmiast na `/live/` i głosuje.
Wyniki lecą do wszystkich przez SSE, bez odświeżania.

**Ksywki.** Przy wejściu na `/live/` każdy dostaje wylosowaną ksywkę (`zgubiony-pakiet`,
`leniwy-węzeł`) i może ją zmienić na własną. Nikt się nie loguje — tożsamość to
ciasteczko. Pytanie zostaje podpisane ksywką z chwili napisania: późniejsza zmiana nie
przepisuje historii, bo sala pamięta, kto co powiedział.

**Nastrój sali.** Dwa przyciski na `/live/`: **zgubiłem się** i **fajnie wytłumaczone**.
To nie jest ankieta — nikt o nic nie pyta, sala mówi to sama, kiedy chce, i nikt nie
widzi, kto co kliknął. Reakcja liczy się przez 30 sekund i sama gaśnie, więc pasek
w panelu pokazuje, jak jest przy tym slajdzie, a nie jak było przez cały wykład. Jedna
reakcja na osobę: drugi przycisk zmienia zdanie, ten sam odnawia pół minuty.

**Pytania z sali.** Pod ksywką, z podbijaniem. Najczęściej podbijane idą na górę, a ty
w panelu oznaczasz je jako odpowiedziane. Jeden głos na przeglądarkę (ciasteczko).

**Moderacja.** W panelu, w sekcji „Sala", widzisz listę osób: ksywka, adres, ile napisała
pytań i odpowiedzi. Przy każdej są dwa sposoby uciszenia:

- **cień** — po ciasteczku, cichy. Ta osoba pisze dalej i widzi swoje pytania tak, jakby
  nic się nie stało; do sali po prostu nie docierają. Nie ma się z kim kłócić, a przy
  okazji widać w panelu, czy dalej spamuje. Ciasteczko da się wyczyścić i tym samym
  ominąć cień — na wykładzie to zwykle wystarcza.
- **ban adresu** — po IP, głośny. Pisanie jest odmawiane wprost, z wyjaśnieniem, i łapie
  też kolejne przeglądarki z tego samego adresu.

Cień jest filtrem na wyjściu, nie na wejściu: nic nie ląduje w koszu, więc „zdejmij cień"
oddaje sali wszystko, co ta osoba w międzyczasie napisała. Panel widzi jedno i drugie,
oznaczone plakietką „cień" — ale sala nie dostaje żadnego szablonu, który by to pole
wypisywał, bo to by zdradziło całą sztuczkę.

Nad listą jest przełącznik **zamknij pytania**, który wyłącza pisanie całej sali naraz
(np. „teraz słuchamy"). Ani cień, ani ban, ani blokada nie zabierają prawa głosu — ankiety
i podbijanie działają dalej (osobie w cieniu tym bardziej: zamrożone liczniki byłyby
najprostszą podpowiedzią, że coś jest nie tak). Żadne z nich nie kasuje też tego, co ktoś
już napisał; od tego jest „usuń" przy pytaniu i przy odpowiedzi.

Bany żyją w pamięci procesu, więc znikają z restartem — tak jak reszta stanu wykładu.
Za reverse proxy adres bierze się z `X-Forwarded-For`, więc proxy musi ten nagłówek
ustawiać.

**Odpowiedzi od publiki.** Pod każdym pytaniem jest „znam odpowiedź" — ktoś z sali może
odpowiedzieć, a reszta podbija trafne odpowiedzi. Sortują się po głosach, więc od razu
widać, czy sala sama sobie poradziła. W panelu możesz skasować pojedynczą odpowiedź.
Formularz odpowiedzi celowo leży **poza** listą odświeżaną przez SSE (`#answer-box`) -
inaczej cudzy głos kasowałby tekst, który ktoś właśnie pisze.

**Podpowiedzi do zadań.** Odkrywane pojedynczo — student dostaje kierunek, nie
rozwiązanie.

**Topologie.** `/topologie/` rysuje sieci z wykładu jako SVG, z czterema widokami tej
samej sieci: **kable** (każdy osobno), **uproszczone** (wiązka ×N zamiast pęku —
whiteboard), **adresy** (loopbacki, ASN, /31 na łączach) i **routing** (podświetlone
ścieżki plus wypis `show ip route`). Przełączanie to zwykły GET zwracający jeden
fragment, tak samo jak odkrywanie podpowiedzi — bez naszego JavaScriptu.

Rysunek składa się po stronie serwera, bo układ fabrika nie jest zagadką: warstwa to
rząd, urządzenia rozkładają się po nim równo. Podział jest taki, że `internal/content`
wie, **czym sieć jest** (urządzenia, kable, porty, adresy, ścieżki), a `internal/web`
wie, **gdzie to leży na ekranie** (x, y).

W notatkach ASCII art zostaje — plik `.md` ma działać w Obsidianie. Notatka linkuje do
wersji interaktywnej przez `[[topologie/spine-leaf|…]]`.

**Graf notatek.** `/notatki/graf` rysuje wikilinki jako graf (canvas, ~100 linii bez
bibliotek). Kropki są klikalne.

**Vault do pobrania.** `/notatki/vault.zip` pakuje notatki i zadania jako pliki `.md`
z zachowanymi linkami `[[tak]]` — rozpakowanie do Obsidiana działa od razu.

## Dodanie nowej notatki

Wrzuć plik do `content/notes/`:

```markdown
---
title: "Tytuł"
summary: "Jedno zdanie na kartę na liście."
tags: [networking]
---

# Tytuł

Treść z linkiem do [[innej-notatki]] i do [[zadania/route-server-lab|zadania]].
```

Nazwa pliku to slug. Link `[[coś]]` szuka notatki `coś.md`; link z ukośnikiem
(`[[zadania/…]]`) prowadzi poza notatki i nie liczy się jako krawędź grafu.
Test `TestNoDanglingWikilinks` przypilnuje literówek.

## Dodanie topologii

Wrzuć plik do `content/topologies/`. Opisujesz urządzenia i **reguły** kablowania, nie
same kable:

```yaml
title: "Fabric spine-leaf"
note: centrum-obliczeniowe     # notatka z szerszym opisem
fabric_net: 10.255.0.0/16      # pula, z której lecą /31 na łącza

tiers:
  - id: spine
    label: "Spine"
    devices:
      - { name: spine1, asn: 65001, loopback: 10.0.0.1 }
  - id: rack
    label: "Szafa"
    kind: endpoint             # nie routuje: bez portów i bez /31

mesh:  [{ from: leaf, to: spine }]   # każdy z każdym
pairs: [{ from: rack, to: leaf }]    # i-ty z i-tym

route: { from: leaf1, to: leaf3, prefix: 10.1.3.0/24, note: "…" }
```

Kable, nazwy portów (`swp1`, `swp2`, …), adresy `/31` i ścieżki trasy liczą się z tego
przy wczytywaniu. Dołożenie czwartego spine'a to jedna linijka — reszta rysunku,
tabela adresów i wypis z routera dopiszą się same i nie mogą się rozjechać, bo mają
jedno źródło. Zły plik (nieistniejąca warstwa w regule, trasa donikąd, za mała pula)
wywala się przy starcie, a nie dziwnym obrazkiem na wykładzie.

Slug (nazwa pliku) wpisuje się do agendy wykładu jako `topologies: [spine-leaf]`.

## Przed pierwszym wykładem

- [ ] ustawić `PANEL_TOKEN` na coś nieoczywistego,
- [ ] postawić to za HTTPS (reverse proxy) i sprawdzić, czy SSE nie jest buforowane
      (`proxy_buffering off` w nginx) oraz czy proxy ustawia `X-Forwarded-For` — bez
      tego ban adresu obejmie całe proxy,
- [ ] przejść całą agendę w `/panel` na próbę, na sali obok,
- [ ] mieć plan B, gdy wifi na sali padnie — strona działa też bez części live.

## Pomysły na dalej

- QR kod z adresem `/live/` na slajdzie tytułowym,
- interaktywny slajd per temat: symulator wyboru trasy BGP, licznik sesji w pełnej
  siatce, wizualizacja enkapsulacji pakietu,
- zapis wyników ankiet do pliku po wykładzie (teraz znikają z restartem),
- eksport agendy do PDF/slajdów.
