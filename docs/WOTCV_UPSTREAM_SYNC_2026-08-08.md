# Synchronizacja upstreamu z 2026-08-08

## Cel i kontekst

Celem synchronizacji było bezpieczne włączenie ponownie wyrównanego `master` do `feat/wotcv` bez utraty zmian specyficznych dla WoT-CV. Dodatkowym wymaganiem było zachowanie PR-a `perf(server): serve pre-compressed tracking assets` oraz usunięcie klasy ryzyka, która mogła doprowadzić do uruchomienia aplikacji na nowych, pustych volume po zmianie katalogu albo nazwy projektu Compose.

Synchronizacja kodu nie odtwarza sesji, które zniknęły wcześniej. Bez audytu serwera i backupów nie można potwierdzić dokładnej przyczyny ani odzyskać danych samym merge. Wprowadzone zabezpieczenia mają zatrzymać przyszłe wdrożenie przed zmianą projektu, volume lub zakresu danych.

## Zamrożone wejścia

- gałąź docelowa przed merge: `feat/wotcv` = `977d9d7fa5eb24f17bfa98594f9ed732da4657a3`,
- źródło: `master` = `481da6aed60ab5803cdd11ae52e2002bd3fec130`,
- wspólna baza: `1a858fb3ec51966656db172e08a8377b902f0d8d`,
- rozbieżność: 120 commitów tylko po stronie WoT-CV i 8 commitów tylko po stronie `master`,
- backup: `backup/feat-wotcv-before-master-20260808-481da6ae`,
- izolowana gałąź robocza: `integration/master-481da6ae`,
- merge commit: `f944bbb10d76b3709a72c9521ef83d1b107b4267`.

Merge commit ma dokładnie dwóch oczekiwanych rodziców: poprzedni `feat/wotcv` oraz zamrożony `master`. Nie użyto rebase, squash ani automatycznego pushowania.

## Zmiany wniesione z master

Osiem nowych commitów źródłowych obejmowało sześć commitów funkcjonalnych i dwa commity synchronizujące fork z upstreamem:

- poprawkę klasyfikacji niestandardowych UTM bez referrera jako Referral,
- rozszerzenie detekcji botów o sygnały rozmiaru ekranu, stare przeglądarki i dodatkowe statystyki,
- aktualizację list ASN centrów danych z 2026-08-07,
- filtrowanie nazw zdarzeń na poziomie wierszy zamiast wyłącznie na poziomie sesji,
- ograniczenie wpływu bardzo długich URL-i na układ timestampu w widoku sesji,
- aktualizację listy klientów strony dokumentacyjnej.

Delta upstreamu obejmowała 19 plików, w tym tracker, `getEvents`, detekcję botów, klasyfikację kanałów, pojedynczy komponent klienta i dwa pliki dokumentacji.

## Analiza nakładania zmian

Porównanie obu stron względem wspólnej bazy wykazało:

- 408 ścieżek zmienionych wyłącznie przez WoT-CV,
- 16 ścieżek zmienionych wyłącznie przez najnowszy `master`,
- 3 ścieżki zmienione po obu stronach:
  - `server/public/script-full.js`,
  - `server/public/script.js`,
  - `server/src/api/analytics/events/getEvents.ts`.

Git zgłosił dwa konflikty wymagające ręcznej decyzji: wygenerowany `server/public/script.js` oraz `getEvents.ts`. Nie wystąpiły konflikty migracji, schematów danych, Compose, lockfile ani źródeł Identity Resolution v2.

## Decyzje konfliktowe

### Zapytanie zdarzeń

W `getEvents.ts` zachowano rozwiązanie tożsamości WoT-CV oparte na `clickhouseResolvedIdentifiedUserId("events")` i projekcję z `getEventColumns`. Jednocześnie przyjęto upstreamową korektę `getFilterStatement` z `sessionLevelParams: ["channel"]`, dzięki której nazwa zdarzenia jest filtrowana na poziomie wiersza.

Do nowego testu upstreamu dodano regresję potwierdzającą obecność odczytu `user_identity_dict` oraz aliasu `identified_user_id` w wynikowej projekcji SQL.

### Tracker i kompresja

Wygenerowane pliki trackera nie były rozwiązywane przez wybór jednej strony konfliktu. Najpierw połączono źródła, a następnie uruchomiono:

```bash
cd server
npm run build:analytics
npm run check:analytics
npm run build:compressed-assets
```

Zachowano PR `977d9d7f perf(server): serve pre-compressed tracking assets (#1)`. W samym merge commicie pliki `.gitignore`, `server/package.json`, `server/scripts/precompress-static-assets.mjs` i `server/src/index.ts` pozostały identyczne względem wejściowego `feat/wotcv`. Późniejszy commit zabezpieczający wdrożenie dopisał do `.gitignore` wyłącznie ogólne wpisy Pythona (`__pycache__/` i `*.py[cod]`); pozostałe trzy pliki implementujące prekompresję nadal są identyczne. Regeneracja utworzyła aktualne warianty Brotli i gzip dla wszystkich śledzonych assetów.

## Dowody zachowania zmian WoT-CV

- żadna z 408 ścieżek należących wyłącznie do WoT-CV nie zmieniła się nieoczekiwanie,
- wśród ścieżek należących wyłącznie do `master` wykonano tylko dwie kontrolowane korekty: test regresji tożsamości w `getEvents.test.ts` oraz usunięcie końcowych spacji w `getChannel.test.ts`,
- zachowano dokładne hashe lockfile `client`, `server` i `shared`,
- nie zmieniono migracji PostgreSQL, snapshotów Drizzle, konfiguracji ClickHouse, Redis, Compose ani usług sesji w samym merge,
- liczba migracji, snapshotów i wpisów journal pozostała równa 15, z indeksami od `0000` do `0014`,
- merge względem poprzedniego `feat/wotcv` obejmuje oczekiwane 19 plików: 1455 dodań i 891 usunięć, z czego dodatkowe siedem linii to kontrolowany test regresji WoT-CV.

## Zabezpieczenia trwałości dodane po merge

Overlay `docker-compose.wotcv.yml` deklaruje teraz `clickhouse-data`, `postgres-data` i `redis-data` jako external volume o jawnych nazwach. Compose nie może już automatycznie utworzyć pustych zamienników zależnych od nazwy katalogu.

Każdy skrypt wdrożeniowy przed operacją `up`:

1. wymaga oczekiwanej nazwy projektu Compose,
2. waliduje wynik `docker compose config --format json`,
3. wymaga istnienia wszystkich trzech external volume,
4. sprawdza etykietę projektu uruchomionych kontenerów,
5. porównuje typ, nazwę, cel i tryb RW każdego faktycznego mountu,
6. zapisuje liczbę użytkowników i stron PostgreSQL oraz liczbę, minimalny i maksymalny timestamp tabeli ClickHouse `events`,
7. po migracji lub odtworzeniu potwierdza, że liczniki nie spadły i nie zniknął wcześniejszy zakres czasu.

Start oraz rollback aplikacji używa `--no-deps`, więc nie odtwarza zależności infrastrukturalnych. Logika walidacyjna znajduje się w niezależnym helperze Python opartym wyłącznie na bibliotece standardowej i ma testy jednostkowe uruchamiane przez workflow CI.

## Naprawa istniejącej bramki klienta

Kontrola wejściowego `feat/wotcv` wykazała, że `npm run knip` kończyła się błędem jeszcze przed bieżącym merge z powodu dziewięciu eksportów używanych wyłącznie wewnątrz modułów osi czasu replay. Ponieważ ta komenda jest obowiązkową bramką workflow obrazów, po merge usunięto wyłącznie modyfikatory `export` z trzech funkcji lub stałych i sześciu typów wewnętrznych. Nie zmieniono implementacji ani zachowania runtime. Po korekcie Knip, testy replay, TypeScript i produkcyjny build klienta przechodzą.

## Walidacja lokalna

- `shared`: build TypeScript przeszedł.
- `server`: 95 plików i 1188 testów przeszło; `db:check`, build TypeScript, regeneracja trackera, prekompresja i `check:analytics` przeszły.
- `client`: 12 plików i 70 testów przeszło; TypeScript, build Next.js, `lint:wotcv`, Knip, audyt PL i `format:check:wotcv` przeszły. Audyt PL objął 2139 komunikatów: 0 braków, 0 nadmiarowych kluczy, 0 pustych wartości i 0 niezgodności placeholderów.
- `docs`: build Next.js i generacja 4440 stron statycznych przeszły.
- zabezpieczenia trwałości: 20 testów jednostkowych przeszło; workflow YAML parsuje się, a wszystkie zmienione skrypty przechodzą `bash -n`.
- błędna nazwa projektu została dodatkowo sprawdzona w obu entrypointach wdrożenia; skrypty kończą się kodem 1 przed próbą użycia Dockera.
- końcowe `git diff --check` oraz porównanie kontrolowanych ścieżek z oboma wejściami merge przeszły.

Pierwsze równoległe uruchomienie pełnych testów serwera i klienta wywołało pięć nieobsłużonych wyjątków podczas zamykania testowego serwera MCP, mimo 1188 zaliczonych asercji. Test MCP uruchomiony osobno przeszedł na Node 22 i 24, a pełna macierz serwera powtórzona bez konkurencyjnego builda klienta przeszła na Node 22 bez wyjątków. Workflow wykonuje te kroki sekwencyjnie.

Pełne, niewiążące audyty całego upstreamu nadal pokazują wcześniejszy dług: server Knip i Prettier nie mają czystego baseline, a pełny ESLint klienta raportuje 82 błędy i 153 ostrzeżenia poza zakresem zmienionych plików. Wiążące bramki WoT-CV są zielone; upstreamowy `PageviewItem.tsx` został dodatkowo sprawdzony osobno przez ESLint.

Migracji produkcyjnej nie uruchamia się podczas tej walidacji. Nie wykonuje się też pushowania ani wdrożenia produkcyjnego.

## Kontrola przed wdrożeniem

1. Wykonać i zweryfikować backup PostgreSQL, ClickHouse i Redis.
2. Zapisać `docker volume inspect` oraz `docker inspect ... .Mounts` dla aktualnych kontenerów.
3. Potwierdzić istnienie `rybbit_clickhouse-data`, `rybbit_postgres-data` i `rybbit_redis-data`.
4. Uruchomić preflight Identity Resolution v2 przed wdrożeniem; nie omijać błędu volume ani projektu.
5. Wdrożyć konkretne pełne SHA przez `WOTCV_EXPECTED_SHA`.
6. Po wdrożeniu ponownie sprawdzić preflight, health, zakres dat sesji, dashboard, tracking, replay i logi.
7. Zachować branch backup do czasu potwierdzenia danych historycznych i co najmniej jednego pełnego cyklu backupu po wdrożeniu.

## Ograniczenia

- Lokalny host Windows nie udostępnia Docker CLI, dlatego rzeczywisty rendering Compose i inspekcja kontenerów muszą przejść w CI lub na serwerze Ubuntu przed wdrożeniem.
- Zabezpieczenie nie zastępuje backupu i nie odtwarza wcześniej utraconych sesji.
- Spadek niezmienników `events` zatrzymuje wdrożenie nawet wtedy, gdy mógł wynikać z retencji. Jest to celowe zachowanie fail-closed; wymaga ręcznej analizy zamiast automatycznego zignorowania.
