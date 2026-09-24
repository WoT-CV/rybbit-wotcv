# Redukcja Replay — wykonanie, 2026-09-24

## Obowiązujący zakres

Użytkownik zatwierdził implementację z commitami na koniec każdego etapu oraz
wyłączył prywatne archiwum body i multipart w Loki. Bez push i deploy.
Nie zwiększamy limitów. Nie usuwamy historii ani unikalnych danych przeglądarki.
Duże body w Grafanie pozostanie pominięte; jest to zaakceptowane ograniczenie,
nie rozwiązany problem trwałego przechowania. Dla danych bez dowodu zachowania
nie uruchamiamy dodatkowej redukcji full. Nowy FE pozostaje metadata privacy cap.

Kolejność: 0 → 1A → 1C (bez archiwum) → 2 → 3 → 4 → 5 → 6.
Każdy etap: analiza bieżącego kodu → plan → kod → test → review → poprawka → commit.
Nie traktować brakujących testów infrastruktury/urządzenia jako PASS.

## Etap 0 — analiza i plan przed implementacją

Stan wejścia: Rybbit d6b623ec, FE e5d822b9, BE 6fe486d7. W BE dwie zastane
pozycje AD ResourceTimingFilter pozostają poza zakresem i indeksami commitów.
SSH read-only 12:28:27 UTC: health ok na d6b623ec; FE metadata/e5d822b9;
tracking-config full. Body/event/batch: 1 000 000/2 500 000/7 000 000 B,
odczyt body 1000 ms. Loki: metadata 64KB/128 pól, line 256KB, rate/burst 32/64 MB;
główna retencja 30d (config zawiera też domyślne pola 0s, nie nadpisujemy jej).
Tempo: override 30d i pola bazowe 336h. Nginx tracking: 50M, body timeout 120s.
Nie zmieniono żadnej z tych wartości.

Plan:

1. Syntetyczny corpus bez danych produkcyjnych: metadata, legacy full, Unicode,
   snapshot, incremental, nieznany plugin, puste/zerowe wartości, kolejność.
2. Benchmark Node: rzeczywiste bajty UTF-8, gzip, round-trip i koszt CPU.
   Wyniki Node nie zastępują Safari/iPhone. Powtarzalny seed i świeże fixture'y.
3. CLI runtime audit wypisuje wyłącznie allowlistę flag/limitów/health SHA;
   nie wypisuje wejściowej konfiguracji ani sekretów przy błędzie walidacji.
4. Testy narzędzi Node bez instalowania nowych zależności.
5. Review: test mutacji fixture, Unicode, redakcja wyjścia, błędy HTTP, brak
   automatycznego network access w benchmarku, zero zmian limitów/produkcji.

Kryteria dalszych etapów: zero różnic canonical danych; niezmienione limity;
benchmark formatów na tym samym corpusie (minimum 30 prób po rozgrzewce).
Nowy codec aktywujemy tylko przy mniejszej liczbie wysłanych bajtów i bez
istotnej regresji CPU/heap; budżet porównania p95 CPU: nie więcej niż +10%
ponad v1 gzip dla optymalizacji formatu, z raportem szumu pomiarowego.
Kompresja ma być opcjonalna, małe/niedające oszczędności batche pozostają JSON.
Fizyczny iPhone oraz stagingowy pipeline to osobne bramki release, nie założenia.

### Wyniki i review

- `node --test scripts/tests/replay-data-baseline.test.mjs`: 4/4 PASS.
- `node scripts/replay-data-baseline.mjs --live`: PASS; obecne limity zgodne
  z baseline. Synthetic JSON/gzip: small 871/459 B; metadata 104223/4635 B;
  legacy 32183/1723 B; mixed 258393/13776 B. Nie są to oszczędności produkcyjne.
- Review: dodano bramkę wykrywającą wzrost limitów i ukrywanie treści błędu
  parsera JSON (odpowiedź serwera nie może wyciec do raportu diagnostycznego).
- `git diff --check`: PASS. Bez zmian runtime, zależności i danych produkcyjnych.

## Etap 1A — wynik w BE

BE `05278c30`: jawne stany/rozmiary, ograniczony capture, brak doczytywania
odrzuconych requestów, izolacja błędów loggera, redakcja sekretów strukturalnych.
Plan, review i komendy w BE `docs/REPLAY_DATA_REDUCTION.md`. Reactor
`mvn -pl observability,api-shared -am test -q` PASS. Bez deploy. Staged pliki
ResourceTimingFilter zachowane, potwierdzone niezmienionymi hashami indeksu.

## Etap 1C — analiza i plan przed implementacją

Nie ma archiwum, więc nie implementujemy readera, receipt ani linku do obiektu.
Istniejące linki Grafana pozostają wyszukiwaniem logów/trace, nie dowodem pokrycia.
Nowe stany z 1A nie są jeszcze na produkcji. Read-only audyt nie może zaliczać
starych wpisów jako nowego kontraktu.

1. Bounded CLI Loki query (ostatnia godzina, maks. 200 wpisów; bez paginacji
   ukrytej jako kompletne pokrycie). Maks. 8 MiB odpowiedzi narzędzia, 10 s timeout.
2. Raport tylko liczników: rozkład stanów, brakujące strony wymian, budżet
   UTF-8 metadata 64 KiB / 128 atrybutów i wartości SDK 16384 znaków.
3. Unknown/fake state i brak body przy inline = luka. Empty nie równa się brak
   loga. Nie wypisywać wartości ani correlation ID; próbka nie jest gwarancją.
4. Runbook Grafana, zapytania i macierz testów staging (bez mutacji prod),
   warunki NO-GO przy dropach/retencji/niepełnych danych. Test redakcji raportu.
5. Uruchomić CLI przez istniejące SSH wyłącznie read-only, review, commit.

### Wynik 1C / review

4/4 testy Node PASS. SSH: 200 wpisów, 100 sparowanych correlation ID, maks.
10570 B / 61 atrybutów; w próbce brak przekroczeń. 200 stanów unknown jest
oczekiwane — nowy BE nie został wdrożony. Próbka osiąga limit i NIE dowodzi
trwałości ani kompletności całego ruchu. Test end-to-end po wdrożeniu na staging
pozostaje bramką release. Review poprawiło odczyt API Loki: należy zażądać
`categorize-labels` i czytać `structuredMetadata`, nie traktować braku pola jako
zera wykorzystania budżetu. Brak metadata ma osobny licznik.

## Etap 2 — analiza i plan przed implementacją

Po wyłączeniu 1B żaden lokalny ID ani profil Grafany nie stanowi dowodu trwałości.
Nie powstanie martwy mechanizm przyjmujący `bodySaved` od przeglądarki. Resolver
w shared będzie rozdzielał request body/response body/nagłówki/query i obserwacje
przeglądarki. Dokładny origin, w tym scheme/port, oraz profil serwera ograniczają
tylko wyszukiwanie. Brak profilu, abort/opaque, brak ID i obcy origin nie mogą
wywołać usunięcia danych. Stan verified/expired jest zarezerwowany do przyszłego
zaufanego dowodu, którego aktualnie nie ma.

Plan: czysta funkcja v1 bez I/O i nowych pól w każdym evencie; runtime walidacja
wejścia; testy spoofingu origin/ID/stanu, błędów sieci i zachowania wszystkich
pól. Zastosowanie w UI w etapie 3. Kontrakt nie zmienia privacy cap ani transportu.

### Wynik 2 / review

15/15 Vitest PASS, shared build PASS. Resolver nie przyjmuje żadnego receipt i
zawsze zabrania dodatkowego usuwania captured fields. Historyczny obiekt wejścia
pozostaje nietknięty. Inny port/scheme/subdomena nie dziedziczą profilu. Same
statusy 200/401/403/500 i poprawne ID niczego nie potwierdzają. Bez nowych bajtów
w uploadach, bez zależności i importów server/src do klienta.

## Etap 3 — analiza i plan przed implementacją

FE już ustawia metadata. Serwer full pozostaje dozwolonym fallbackiem starszych
trackerów; bez 1B nie wolno globalnie go wyłączyć. Powtarzający się kod normalizacji
script tagu przenosimy do kontraktu shared, z testami wszystkich kombinacji.
Istniejący reader historycznych body pozostaje bez zmian. Nie dodajemy receipts,
request headers ani usuwania przy ingest, ponieważ nie ma zaufanego dowodu.

Plan: shared resolver privacy cap → użycie w recorder config → UI komunikat
unknown/unavailable (nigdy fałszywe verified) → stopPropagation dla linków →
testy React i parserów v1/full/metadata → extract/uzupełnienie lokalizacji → review.
Nie wymuszamy odświeżenia starych kart. Rollback nie zmienia capture obecnego FE.

### Wynik 3 / review

67/67 testów konfiguracji/privacy cap oraz 13/13 testów linków, historycznych
parserów i kontraktu PASS. Shared build PASS. Dwa komunikaty przetłumaczone we
wszystkich 12 językach; zachowane istniejące wartości i kolejność kluczy (extract
nie powoduje przypadkowego przeformatowania całych katalogów). Review uwzględniło
różnicę null/undefined dla brakującego atrybutu DOM: brak tagu zachowuje politykę
serwera, obecny błędny tag ogranicza do metadata. Klik/pointer nie zamyka przodka.
Nie zmieniono historycznych payloadów, limitów ani ustawień produkcyjnych FE.

## Etap 4 — ponowna analiza i plan przed implementacją

Fastify ma dziś limit 10 MiB, recorder 7 MB na batch oraz istniejące retry/split413.
Nie zmieniamy żadnego z nich. Zlib async z maxOutputLength pozwala ograniczyć
rozpakowywanie przed parsowaniem JSON; wejście również liczymy i ograniczamy do
aktualnego route bodyLimit. Hook dotyczy wyłącznie POST record. Nie ma globalnego
decompressora ani synchronizowanego gunzip na event loop. Limit obowiązuje także
dla sklejonych członów gzip. Content-Length dotyczy bajtów zakodowanych.

1. Route-local preParsing: identity/gzip; 415 inne encoding, 400 uszkodzone gzip,
   413 wejście/wyjście ponad dotychczasowy limit; bez wypisywania payloadów.
2. Content-Encoding w CORS tylko dla record. Public capability v1/gzip reklamowane
   wyłącznie przy WOTCV_REPLAY_UPLOAD_GZIP=true i aktywnym replay; domyślnie false.
3. Tracker: JSON snapshot przed await, CompressionStream bez nowej zależności,
   próg 4 KiB, tylko oszczędność >=10%, brak kompresji przy hidden/unload.
   Brak wsparcia/błąd lokalny = ten sam JSON. HTTP415 lub błąd sieci wyłącza gzip
   na pozostały czas życia transportu; następna istniejąca próba idzie JSON.
   Brak dodatkowego retry, brak zmiany tożsamości, kolejności i rozmiarów batchy.
4. Zachować sequenceNumber w walidacji ingest (obecny Zod usuwa to pole).
5. Testy golden Unicode/nieznane pluginy, legacy JSON, błędne gzip/JSON, bomb,
   CORS, negotiate/rollback, brak wsparcia i retry budget. Potem review i commit.

Deployment: najpierw backend z flagą false, potem tracker, dopiero canary po
staging/iPhone. Wyłączenie flagi zatrzymuje nową negocjację; stare karty nadal
muszą mieć działający decoder. Downgrade do starego backendu wymaga pozostawienia
zgodnego decoder-a albo zakończenia kart (415/network-error fallback ogranicza
ryzyko, ale nie zastępuje tej bramki). Nie zmieniamy produkcji w tej sesji.

### Wynik 4 / review

123/123 testy ukierunkowane PASS, server tsc --noEmit PASS. Gzip jest dokładnym
round-tripem bajtów JSON, mniejszym o >=10% albo niewysyłanym. Testy obejmują
chunked input bez Content-Length, sumę kontrolną, truncated gzip, gzip bomb,
wiele członów gzip, granicę limitu, CORS, stare JSON i snapshot identity.
Review naprawiło gubienie sequenceNumber przez Zod oraz typowanie Fastify przy
nowym hooku. Nie zmieniono retry, split413 ani kolejek recordera. Flaga false.
Buforowanie jest ograniczone: wejście do route bodyLimit, wyjście do tej samej
wartości przez async zlib maxOutputLength; nie są to zwiększone limity.
Zewnętrzny proxy i fizyczny iPhone wymagają canary przed aktywacją flagi.

## Etap 5 — ponowna analiza i plan przed implementacją

Gzip już usuwa powtarzające się nazwy/URL. Kompaktowy JSON nie gwarantuje mniejszego
transferu po gzip. Prototypy będą wyłącznie w narzędziu benchmarkowym, nigdy w
publicznym ingest, dopóki nie przejdą bramek. Badamy osobno: (A) puste nagłówki
i stałe v1/metadata w znanym pluginie oraz (B) słownik powtórzonych stringów
wyłącznie w typowanych polach Network Replay. Nie zmieniamy DOM ani historii.

1. Wersjonowane envelope obu prototypów, jawne odtwarzanie nieobecności vs pustych
   pól, ograniczona liczba referencji/słownika, kontrola indeksów i kolizji.
2. Golden/property-style testy: Unicode, null/0/false, empty vs absent, unknown
   plugin, próba prototype pollution, mutacja wejścia, limity canonical.
3. Porównać plain/gzip obu kandydatów z v1 na tym samym korpusie. 30 powtórzeń
   po rozgrzewce, encode+serialize+native gzip, round-trip decode, p95, long tasks
   i heap tam gdzie API przeglądarki je udostępnia. Tylko syntetyczne dane.
4. Użycie Chromium/Firefox/WebKit jeśli lokalne narzędzia dostępne; odnotować
   brak wsparcia zamiast zastępować wyniki pomiarem Node pod nazwą Safari.
5. Dla każdego kandydata decyzja: wdrożenie dopiero przy oszczędności po gzip i
   CPU <=110% v1. W przeciwnym razie commit prototypów/raportu z odrzuceniem,
   bez nowego decoder-a produkcyjnego i powierzchni ataku. Review i commit.

### Wynik 5 / review — oba prototypy odrzucone

6/6 testów (w tym 400 wariantów danych) PASS. Native CompressionStream w
Chromium 153, Firefox 155 i WebKit 26.6: wszystkie byte/semantic round-trip PASS.
Raport: `replay-browser-benchmark-2026-09-24.json`. 30 prób po 3 rozgrzewkowych.

Przykład Chromium, bajty gzip (v1 / defaults / dictionary):

| Korpus | v1 | Puste/stałe | Słownik |
| --- | ---: | ---: | ---: |
| small | 459 | 478 | 500 |
| metadata | 4635 | 6175 | 5610 |
| legacy | 1723 | 1951 | 2000 |
| mixed | 13776 | 14458 | 14332 |

Mniejszy JSON dał WIĘKSZY gzip we wszystkich korpusach i silnikach. Dodatkowo
Chromium mixed encode p95 0.8 ms -> 3.6/3.8 ms. Nie ma uzasadnienia dla aktywacji
v2 ani dodawania produkcyjnego parsera. Oba kandydaty zakończone decyzją REJECT.
Prototypy pozostają wyłącznie w scripts/lib, nie importuje ich produkcja.

WebKit Windows nie jest fizycznym iPhonem. Upload p95 obejmuje scheduler i
rozdzielczość zegara (szczególnie 15–16 ms WebKit), nie jest czystym CPU gzip.
Long Tasks: Chromium 0 w tym teście, pozostałe silniki API unsupported (null).
Heap dostępny tylko jako końcowy pomiar Chromium, nie peak per-codec ani dowód
braku regresji na urządzeniu. Brak tych pomiarów NIE jest uznany za zaliczenie.
Testy odrzucają nieznane wersje/indeksy/kolizje i nadmierne rozmiary. Limitów
nie zmieniono; dane użytkowników nigdy nie są używane jako fixture.

## Etap 6 — ponowna analiza i szczegółowy plan zamknięcia

Pozostają trzy niezależne warstwy: reprezentacja HTTP w BE, bezstratny transport
replay oraz rollout. Zaliczenie jednostkowych testów nie oznacza kompletności
Loki ani poprawności Safari/iPhone na produkcji. Etap 1B jest wyłączony.

1. Przeczytać diff BE/Rybbit, zwłaszcza wrappery Servlet, częściowo odczytany
   request, reset/sendError/redirect, async, MDC cleanup, redakcję oraz granice
   capture. Nie ruszać obcych staged ResourceTimingFilter w BE.
2. Uruchomić pełne testy Rybbit, shared/server/client typecheck/build/lint oraz
   narzędzia Node/Python dotyczące bezpieczeństwa deploy i nowego audytu.
   BE: pełny reactor observability + api-shared z zależnościami.
3. Lokalny test HTTP: te SAME produkcyjne uploader/decoder, cross-origin CORS,
   Chromium/Firefox/WebKit, historyczne/nowe eventy, concurrency i rollback415;
   odczyt canonical payloadu bez DB, żadnych zapytań mutujących produkcję.
4. Sprawdzić odseparowany build klienta (brak server/src w obrazie). Docker jeśli
   dostępny; w przeciwnym razie analogiczny izolowany kontekst i jawne ograniczenie.
5. Staging/prod: tylko read-only health/config i licznikowy audyt logów. Brak
   produkcyjnego wdrożenia, zmian env, migracji albo testowych POST na własne API.
6. Każdą znalezioną wadę opisać, poprawić i dodać regresję; powtórzyć dotknięte
   testy. Release manifest: commity, wyniki, flagi, kolejność BE -> Rybbit decoder
   -> canary writer, rollback bez kasowania historii, osobne NO-GO coverage/gzip.
7. Fizyczny iPhone, staging przez reverse proxy oraz end-to-end potwierdzenie
   nowych stanów BE w Loki pozostają obowiązkowe przed pełnym rolloutem. Nie
   pozorować ich wykonania ani obiecywać, że duże body będą w Grafanie.

### Korekta 6B — plan przed poprawką bundla

Review artefaktu wykazało, że CommonJS barrel shared dokleja do trackera nawet
resolver pokrycia używany wyłącznie w panelu. Plan: alias shared na jego źródło
ESM w esbuild (analogicznie do istniejącego aliasu kontraktu botów), umożliwiający
tree shaking; porównać faktyczne bajty/minified/gzip i sprawdzić metafile, że
żaden kod Node ani zależności serwera nie trafia do bundla. Test regressji bundla,
ponowny build i test trackerów; bez zmiany logiki ani zależności.

Wynik 6B: test metafile i tree shaking PASS. Minified tracker spadł z 71180 B
(bazowy d6b623ec) do 63369 B, mimo dodania gzip. Przy tym samym gzipSync:
22059 -> 19753 B. Produkcyjny precompress (jego poziom) daje 19726 B gzip.
W bundlu nie ma resolvera coverage, usług serwera ani CommonJS shared/dist;
pozostaje celowa zależność web-vitals. Nie usunięto danych replay.

### Wynik 6 — końcowa walidacja i review

- Rybbit client: 60 plików / 641 testów PASS. Server po poprawce bundla:
  170 plików / 2409 testów PASS, 2 pliki / 16 testów integracyjnych ClickHouse SKIP.
- Shared/server/client build oraz server typecheck PASS. Dodatkowy frozen offline
  install i build klienta w osobnym katalogu, bez server/src: PASS. Nie wykonano
  Docker/Alpine build, ponieważ Docker nie jest dostępny w tym środowisku.
- Narzędzia Node: 14/14 PASS; istniejące testy Python wotcv deploy: 47/47 PASS.
- BE reactor observability/api-shared i zależności PASS. Własna korekta 6A
  `b285456e`: wszystkie overloady Servlet redirect, charset/locale, reset/flush,
  błędne UTF-8 i bodyless205. W tych dwóch modułach 64 + 137 testów, bez skipów.
- Produkcyjny uploader i decoder przeszły lokalny cross-origin HTTP w trzech
  silnikach: 39 żądań, zgodność payloadów, CORS, stary JSON, gzip i fallback415.
  Test trzech równoległych instancji uploadera nie jest pełnym testem wielu kart
  aplikacji ani testem odtwarzacza na iPhonie. Żadne żądanie nie trafiło na prod.
- Pełny lint: 85 błędów i 168 ostrzeżeń. Wszystkie 85 błędów leżą w plikach
  identycznych z baseline d6b623ec (porównanie normalizuje wyłącznie CRLF/LF).
  Lint zmienionych komponentów PASS. Pełny lint NIE jest oznaczony jako PASS;
  nie wyłączono reguł ani nie podniesiono progów. Ten dług pozostaje jawny.
- Read-only SSH: health na d6b623ec, limity bez zmian. Ostatnia próbka Loki:
  200 wpisów / 100 par / unknown200 / brak brakującego metadata, maks. 9874 B
  i 61 atrybutów; bez przekroczeń w próbce. Nowy BE nie jest wdrożony, dlatego
  ta próbka nie weryfikuje nowych stanów. Nie potwierdza trwałego pokrycia.
- Review: kolejność dwóch nowych kluczy w 12 słownikach dopasowano do extractor-a;
  wartości tłumaczeń pozostają niezmienione. Nie ma cross-importu server/src do UI.
  Testy/raporty nie zawierają body, tokenów ani ID z produkcji.

Dodano powtarzalne narzędzia `replay-http-smoke.mjs`,
`replay-lint-baseline.mjs` i `verify-isolated-client.ps1`. Porównanie baseline
lintu nie zastępuje właściwego lintu. Bez push, deploy, migracji i zmian FE.
Zastany indeks dwóch plików ResourceTimingFilter w BE pozostał niezmieniony.

Decyzja: kod gotowy do staging; pełny rollout produkcyjny pozostaje NO-GO do
zaliczenia bramek opisanych w
[raporcie końcowym](replay-data-reduction-release-2026-09-24.md).
Etap 1B jest świadomie wyłączony, nie oczekuje na provisioning.
