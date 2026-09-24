# Replay: raport wykonania i bramki release — 2026-09-24

## Decyzja

Implementacja lokalna i review zakończone. **Kandydat do staging, nie zgoda na
bezwarunkowe wdrożenie i włączenie wszystkich funkcji na produkcji.**
Nie wykonano push, deploy, migracji ani zmiany produkcyjnych zmiennych.
`WOTCV_REPLAY_UPLOAD_GZIP=false` pozostaje domyślną wartością.

Duże body pozostaje jawnie pominięte po osiągnięciu obecnych ograniczeń. Zgodnie
z decyzją użytkownika NIE powstał magazyn/R2/archiwum, fragmentacja w Loki,
manifest składania treści, viewer ani receipt. Nie deklarujemy kompletności
HTTP w Grafanie ani dostępności pełnej treści każdej historycznej wymiany.

Nie zwiększono limitów, timeoutów, retry, retencji, liczby zdarzeń ani kolejek.
Nie usunięto historycznych body, danych DOM, zdarzeń biznesowych, błędów JS,
tożsamości, kolejności ani unikalnych pomiarów przeglądarki.

## Etapy i commity

Każdy etap poprzedzała analiza i plan; wyniki testów oraz korekty opisuje
[dziennik wykonania](2026-09-24-replay-data-reduction-execution.md).
BE ma osobny dziennik `wot-cv-be/docs/REPLAY_DATA_REDUCTION.md`.

| Etap | Repo / commit | Wynik |
| --- | --- | --- |
| 0 — baseline | Rybbit `901f38d7` | Syntetyczny corpus, pomiary i audyt niezmiennych limitów |
| 1A — stany HTTP | BE `05278c30` | empty/inline/redacted/omitted/unknown, bounded capture, redakcja, brak doczytywania body dla logów |
| 1B — duże body | Wyłączony przez użytkownika | Brak nowego magazynu i fragmentacji; pominięcie nie jest zastępczym zapisem |
| 1C — dowody HTTP | Rybbit `ec785f3e` | Ograniczony, read-only audyt Loki oraz macierz staging/OTel/Loki |
| 2 — zakres zastępowania | Rybbit `03db85b5` | Kontrakt oddzielający pokrycie danych od privacy cap i transportu |
| 3 — metadata | Rybbit `2c260033` | Wspólny resolver privacy cap, informacja w UI, zgodność historycznych nagrań |
| 4 — gzip | Rybbit `d87c97a6` | Negocjowany bezstratny upload i ograniczony decoder; domyślnie wyłączone wysyłanie gzip |
| 5 — format | Rybbit `f7702cbc` | Dwa prototypy zmierzone i odrzucone: gorszy gzip, brak nowego formatu produkcyjnego |
| 6A — review BE | BE `b285456e` | Granice Servlet, redirect/reset/flush/charset, błędne UTF-8, HTTP205 |
| 6B — review bundla | Rybbit `9d3ed56a` | Tree shaking shared, test granic bundla, mniejszy tracker |
| 6 — zamknięcie | Commit zawierający ten raport | Test HTTP trzech silników, izolowany build, porównanie lintu i bramki release |

Gałęzie: Rybbit `feat/wotcv`; BE `develop`. FE `develop` pozostał na `e5d822b9`
bez zmian: już wymusza metadata. Nie tworzono pustego commita FE. Zastane dwa
staged/deleted pliki ResourceTimingFilter w BE nie zostały włączone do commitów
ani zmodyfikowane. Commit zamknięcia można ustalić przez
`git log -1 --format="%h %s" -- ops/plans/replay-data-reduction-release-2026-09-24.md`.

## Co wolno redukować

| Źródło informacji | Polityka tej wersji |
| --- | --- |
| Nowy FE z metadata privacy cap | Pozostaje metadata; konfiguracja serwera nie może ponownie włączyć pełnego capture |
| Historyczne lub starsze full | Nie przepisujemy i nie usuwamy body, nagłówków ani query |
| Własne API z correlation/trace ID | Link do wyszukiwania w Grafanie, NIE dowód trwałego zapisu konkretnego pola |
| Inna własna usługa | Wyłącznie jej jawny, dokładny profil origin; nie dziedziczy pokrycia głównego API |
| Obcy origin, browser abort, opaque/network error | Brak założenia, że dane istnieją w naszym backendzie/Loki |
| DOM, snapshot, input, scroll, JS error, Resource Timing | Bez usuwania, nowego samplingu lub zmiany częstości snapshotów |

`mayRemoveCapturedFields` jest celowo zawsze false: ta wersja nie posiada
zaufanego receipt. `body.logged` w BE oznacza przygotowanie lokalne, nie ACK od
Loki. Redacted to treść po redakcji; omitted/unknown nie znaczą empty. Rozmiar
częściowo odczytanego body to zaobserwowane bajty, nie jego wymyślona pełna długość.
Limity oraz brak archiwum oznaczają, że dalsze globalne wyłączenie starego full
nie jest bezpiecznie uzasadnione. To zabezpieczenie przed utratą informacji.

## Pomiary redukcji

Syntetyczny, powtarzalny corpus bez danych użytkowników. Poniższe wartości to
bajty body HTTP/JSON, bez narzutu nagłówków, preflight, TCP i TLS. Nie należy
interpretować ich jako procentowej redukcji całego produkcyjnego ruchu strony.

| Korpus | JSON | Gzip Chromium | Redukcja body |
| --- | ---: | ---: | ---: |
| Metadata | 104223 B | 4635 B | 95,55% |
| Historyczne full | 32183 B | 1723 B | 94,65% |
| Mieszany | 258393 B | 13776 B | 94,67% |

Mały batch 871 B pozostaje plain JSON (próg 4096 B). Gzip wysyłamy tylko jeśli
oszczędza co najmniej 10% bajtów. Brak wsparcia CompressionStream lub błąd
lokalnej kompresji zachowuje JSON. Native gzip nie dodaje biblioteki kompresji
do bundla. Ukryta karta pomija kompresję przy rozpoczęciu wysyłki.

Tracker minified: **71180 -> 63369 B**. Porównanie przy tym samym gzipSync:
**22059 -> 19753 B**; produkcyjny precompress przy swoim poziomie daje 19726 B.
Mimo nowego transportu bundle jest mniejszy; test metafile wyklucza resolver
panelu, CommonJS shared oraz kod API/DB/usług serwera.

Etap 5: pomijanie stałych/pustych pól i słownik powtórzeń zmniejszały JSON,
lecz zwiększały gzip we wszystkich badanych korpusach i trzech silnikach.
Chromium mixed: 13776 -> 14458/14332 B; encode p95 0,8 -> 3,6/3,8 ms.
Nie wdrożono tych codeców. Pełny raport:
[benchmark przeglądarek](replay-browser-benchmark-2026-09-24.json).

30 prób po 3 rozgrzewkowych, Chromium153/Firefox155/WebKit26.6 (Windows).
WebKit Windows nie zastępuje Safari na iPhonie. Czasy z async gzip zawierają
scheduling; rozdzielczość zegara WebKit utrudnia ocenę małych zmian CPU.
Long Tasks: Chromium 0 w pomiarze, pozostałe silniki unsupported, nie zero.
Heap: wyłącznie końcowy snapshot Chromium, nie szczyt per-codec/urządzenie.

## Wyniki walidacji

| Sprawdzenie | Wynik i ograniczenia |
| --- | --- |
| Pełne testy klienta Rybbit | 641 PASS / 60 plików |
| Pełne testy serwera Rybbit po poprawce bundla | 2409 PASS / 170 plików; 16 SKIP / 2 pliki integracji ClickHouse |
| Node: baseline, audyt, prototypy formatu | 14 PASS, w tym 400 wariantów danych w testach prototypu |
| Python: test_wotcv*.py | 47 PASS, zabezpieczenia deploy |
| Shared/server/client build i server typecheck | PASS |
| Izolowany klient bez server/src | Frozen offline install i Next production build PASS; Windows, nie Alpine |
| HTTP: produkcyjny uploader + decoder | 39 żądań / 3 silniki PASS; CORS, canonical payload, Unicode, stare JSON, gzip, fallback415 |
| Testy limitów dekodera | Gzip bomb, połączone człony, chunked, uszkodzone/truncated gzip, CRC, granice bajtowe PASS |
| BE observability/api-shared i zależności | Reactor PASS; 64 + 137 testów tych dwóch modułów, zero failures/skips |
| Lint zmienionych komponentów | PASS |
| Pełny lint klienta | FAIL: 85 błędów, 168 ostrzeżeń; wszystkie błędy w plikach identycznych z baseline d6b623ec |
| Docker/Alpine | Niewykonany: Docker niedostępny lokalnie |
| Fizyczny iPhone, staging proxy, rzeczywista dostawa nowych stanów do Loki | Niewykonane; obowiązkowe przed pełnym rolloutem |

Porównanie lintu nie wyłącza reguł ani nie oznacza pełnego PASS. Zidentyfikowany
dług repo pozostaje oddzielnym zadaniem. Testy zgłaszają też ostrzeżenia
zależności (m.in. sourcemap node-cron i MaxListeners); nie zwiększano limitu
listenerów, aby je ukryć. Nie potwierdzono ich wpływu na działającą aplikację.

HTTP smoke używa syntetycznych danych i rzeczywistych modułów transportu.
Trzy równoległe instancje uploadera sprawdzają odseparowane stany/tożsamości;
nie jest to test trzech otwartych kart pełnej aplikacji ani test jej odtwarzacza.
Nie weryfikuje utrwalenia w ClickHouse. Lokalny endpoint nie korzysta z DB.

## Ostatni audyt produkcji — wyłącznie odczyt

SSH potwierdził health `ok` na wcześniejszym Rybbit `d6b623ec`. W runtime wciąż
były dotychczasowe limity: body 1000000 B, event 2500000 B, batch 7000000 B,
czas odczytu body 1000 ms. Bieżący FE zachowuje metadata privacy cap mimo full
w publicznej konfiguracji serwerowej. Nie zmieniano tych ustawień.

Próbka Loki: 200 wpisów, 100 jednoznacznych par, unknown200, brak brakującego
metadata, maksimum 9874 B / 61 atrybutów, brak przekroczeń w próbce.
Próbka osiągnęła limit: nie jest audytem kompletności. Nowy BE nie jest jeszcze
wdrożony; wynik NIE weryfikuje nowych stanów ani trwałości wszystkich danych.
Żadne wartości body, tokeny i correlation ID nie są zapisane w tym raporcie.

## Powtarzalne komendy lokalne

Uruchamiać z root Rybbit, z wersją pnpm zadeklarowaną przez repo:

```powershell
corepack pnpm test
corepack pnpm run build:server
corepack pnpm run build:client
corepack pnpm --filter rybbit-backend typecheck
node --test scripts/tests/replay-data-baseline.test.mjs scripts/tests/audit-http-evidence.test.mjs scripts/tests/replay-wire-experiment.test.mjs
python -m unittest discover -s scripts/tests -p "test_wotcv*.py"
corepack pnpm lint
node scripts/replay-lint-baseline.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-isolated-client.ps1 -Offline
node scripts/replay-browser-benchmark.mjs C:/PROJECTS/wot-cv-fe/node_modules/playwright-core/index.mjs
node scripts/replay-http-smoke.mjs C:/PROJECTS/wot-cv-fe/node_modules/playwright-core/index.mjs
git diff --check
```

Playwright jest istniejącą lokalną instalacją, a nie nową zależnością Rybbit;
na innej maszynie trzeba wskazać jej rzeczywistą ścieżkę i mieć zainstalowane
silniki. HTTP smoke wymaga wcześniejszego build:server. Skrypt izolowanego
builda pozostawia swój jednoznacznie nazwany katalog tymczasowy do inspekcji.
`replay-lint-baseline` exit0 oznacza brak błędów lintu w zmienionych plikach,
NIE przejście pełnego lintu.

BE: JDK25 i `mvn -pl observability,api-shared -am test -q`. To nie jest
deklaracja wykonania testów wszystkich modułów monorepo ani całego środowiska.

## Kolejność release i warunki GO

1. Zbudować obrazy z zatwierdzonych commitów w docelowym Docker/Alpine. Powtórzyć
   kontrolę zawartości obrazów, typecheck i istniejące testy. Nie omijać obecnych
   preflightów persistence, tożsamości i rewizji wdrożenia.
2. Wdrożyć BE na staging. Zaliczyć macierz
   [HTTP evidence](http-evidence-release-gates.md): endpointy/metody/statusy,
   puste/body pominięte/redacted/inline, Unicode, threshold8192/capture64KiB,
   partial/unread/abort/async, nagłówki, query, exporter delay i restart.
   Porównać niezależne liczniki żądań z eksportem/dostawą; brak loga to luka,
   nie empty. Sprawdzić sekrety oraz odrzucenia/truncation przy OTel/Loki.
3. Wdrożyć Rybbit decoder i tracker na staging z `WOTCV_REPLAY_UPLOAD_GZIP=false`.
   Zaliczyć integracje ClickHouse i odtworzenie starych full oraz nowych metadata,
   sequenceNumber, tożsamość, równe timestampy i nieznane pluginy. Brak migracji
   danych historycznych w tym zakresie.
4. Na staging włączyć flagę, sprawdzić upload przez docelowy reverse proxy.
   Zweryfikować CORS, gzip/JSON, 413/split oraz 415/network fallback w ramach
   istniejącego retry; hidden/background, offline/online, unload i wiele kart.
   Gzip nie pozwala przekroczyć obecnego limitu 10 MiB przed ani po rozpakowaniu.
5. Na fizycznym iPhonie sprawdzić odtwarzanie, seek, przyspieszanie, obrót i
   powrót z tła, także problem zgłaszany wcześniej przez użytkownika. Zmierzyć
   main-thread/long tasks, peak heap, p95 upload i rzeczywiste bajty. Ten etap
   nie stanowi deklaracji naprawienia wcześniejszego błędu wyrzucania z Replay.
6. Po zaliczeniu bramek i zatwierdzeniu wdrożenia: BE, potem Rybbit z flagą false,
   smoke logowania/uprawnień/historycznych sesji. Następnie ograniczony canary
   w ramach dostępnego środowiska/instancji (flaga jest instancyjna, nie per-user).
   Dopiero po pomiarze błędów, retry, CPU/heap i bajtów rozszerzyć rollout.

Nie ma zgody na dodatkowe globalne usuwanie full na podstawie tych testów:
omitted, unknown, brak logu i wygasła retencja nadal nie mają pełnego zamiennika.
Limitów nie podnosić, gdy macierz albo canary ujawni lukę. Jeśli staging ujawni
regresję, poprawić ją osobnym etapem: analiza, plan, kod, test, review, commit.

## Wycofanie

Najpierw wyłączyć reklamowanie gzip (`WOTCV_REPLAY_UPLOAD_GZIP=false`) i sprawdzić
nową konfigurację klienta. Otwarte karty mogą zachować wcześniejszą capability;
**pozostawić decoder działający**. Samo wyłączenie flagi nie uprawnia do usunięcia
dekodera lub natychmiastowego downgrade do starego backendu. Fallback415/network
wykorzystuje kolejną istniejącą próbę i nie jest gwarancją exactly-once.

Nie kasować nagrań ani body w ramach rollbacku. Zmiany BE nie wymagają migracji
bazy; wycofanie musi zachować bezpieczeństwo aplikacji i nie przywracać
nieograniczonego buforowania/doczytywania requestu jako sposobu naprawy logów.
