# Synchronizacja upstreamu z 2026-08-23

## Zamrożone wejścia

- cel przed merge: `origin/feat/wotcv` = `edc0a8aaf50fe6e484b85034d84e2a4b65334e88`,
- źródło: `origin/master` = `0833ad165c8255ecf21a7a1ee40114cf7beabddf`,
- wspólna baza: `481da6aed60ab5803cdd11ae52e2002bd3fec130`,
- rozbieżność: 124 commity tylko po stronie WoT-CV i 26 tylko po stronie `master`,
- zakres ścieżek od wspólnej bazy: 416 zmienionych przez WoT-CV, 452 przez `master`, 90 wspólnych,
- backup: `backup/feat-wotcv-edc0a8aa-before-master-0833ad16`,
- izolowana gałąź: `integration/master-0833ad16-into-wotcv-20260823`,
- izolowany worktree: `C:\PROJECTS\rybbit-wotcv-merge-0833ad16-20260823`.

Merge wykonano bez rebase, squash i pushowania. Git wskazał 31 ścieżek konfliktowych; każdą rozstrzygnięto na poziomie kontraktu i zachowania, a nie przez wybór całych katalogów `ours` albo `theirs`.

## Najważniejsze zmiany upstreamu

Synchronizacja wprowadza między innymi:

- jeden descriptor-driven seam zapytań analitycznych klienta,
- wspólne moduły okien czasowych, metryk strony, kontroli dostępu, konfiguracji strony, requestu trackera i ingestu,
- kontrakt sygnałów botów w `shared` oraz rozszerzoną detekcję botów,
- testy autoryzacji, billingów, SQL i workflow testowy,
- Node.js 24 w buildach, lockfile i workflow,
- lokalnie generowane awatary żab,
- obsługę nawigacji `past-minutes` i korekty granic wykresów,
- addytywną tabelę `session_replay_metadata_v2`,
- usunięcie Uptime z upstreamu.

## Decyzje merge

### Migracje i dane PostgreSQL

Zachowano istniejącą linię migracji WoT-CV, snapshot `0014` i journal. Nie przyjęto upstreamowej migracji `0014_huge_dagger.sql`, ponieważ jej numer kolidował z linią forka i mogła wprowadzić niekontrolowaną zmianę schematu. Kod i schemat Uptime pozostają obecne. Żadnej migracji nie uruchomiono podczas merge ani walidacji lokalnej.

### Identity Resolution v2

Przyjęto nowe seamy tracker/analytics z upstreamu, ale zachowano niezmienne zasady WoT-CV:

- PostgreSQL `user_aliases` i słownik ClickHouse pozostają źródłem rozwiązania tożsamości,
- tracker używa `claimTrackerAlias`, nie może przejąć aliasu innego konta i obsługuje konflikt przez rotację ID,
- panel administracyjny używa jawnej ścieżki `assignAdminAlias`,
- nie ma kolejki backfillu ani historycznych `ALTER TABLE ... UPDATE`,
- zapytania używają efektywnej tożsamości bez przepisywania faktów historycznych,
- legacy hash i bieżący browser ID pozostają obsługiwane zgodnie z dokumentem Identity Resolution v2.

Usunięto upstreamowy `identityBackfillQueue` i wszystkie punkty jego uruchamiania. Test generatora ID naprawiono tak, aby dzienny salt otrzymywał jawny bieżący dzień UTC.

### Session Replay i tabela metadanych v2

Przyjęto korektę zegara urządzenia i addytywną tabelę `session_replay_metadata_v2`, ale nie wykonano ryzykownego natychmiastowego cutoveru. Dodano `REPLAY_METADATA_MODE`:

- `v1` — domyślnie czyta i zapisuje tabelę legacy,
- `dual` — po ręcznym, sprawdzonym backfillu czyta v2 i zapisuje obie tabele,
- `v2` — po zamknięciu okna rollbacku czyta i zapisuje tylko v2.

Nieznana wartość zatrzymuje start backendu. Ingest v1/dual utrzymuje skumulowany rekord legacy, a v2 otrzymuje wyłącznie wkład bieżącego batcha. Odczyty listy, szczegółów, usage i flag sesji wybierają tabelę zgodnie z trybem. Usunięcie sesji, użytkownika albo strony czyści obie tabele. Telemetria i diagnostyka administratora obejmują obie generacje.

Procedura [REPLAY_METADATA_V2.md](../clickhouse/REPLAY_METADATA_V2.md) wymaga backupu, zatrzymania endpointu ingestu, potwierdzenia pustej tabeli v2, jednorazowego backfillu, porównania per sesja i fazy `dual`. Aplikacja nie wykonuje automatycznie backfillu, `TRUNCATE` ani `DROP TABLE`.

### Uptime

Upstream usunął Uptime. W forku zachowano kod klienta i API, schemat PostgreSQL, `monitor_events`, Twilio i agenta monitorującego, aby merge nie usunął historycznych danych ani kontraktów. Jest to zachowanie kompatybilności; samo istnienie kodu nie oznacza, że runtime monitoringu jest aktywny bez osobnej konfiguracji i weryfikacji.

### Tracker, boty i analityka

Przyjęto jednokrotne rozwiązanie requestu trackera i wspólny ingest upstreamu. Na ten model nałożono pola WoT-CV: browser-scoped anonymous ID, konfigurację Network Replay, wykluczenia oraz rozwiązywanie tożsamości słownikiem. Zachowano warstwy i opisy botów WoT-CV, a dane korzystają z nowego bezpośredniego kształtu odpowiedzi upstreamu.

Źródła trackera łączą banner AGPL WoT-CV z upstreamowym kontraktem botów. `script.js`, `script-full.js` i skompresowane warianty są artefaktami generowanymi ze scalonych źródeł, nie ręcznie wybieranymi stronami konfliktu.

### Klient

Przyjęto descriptor-driven analytics seam i usunięto duplikujące fetchery. Zachowano Growth Accounting, replay export, filtry, `past-minutes`, Network Replay i rozszerzenia globusa. Awatar preferuje bezpieczny URL `http/https`, pamięta błąd dla konkretnego URL i przechodzi na lokalnie generowaną żabę. Tooltipy globusa nadal escapują treść i atrybuty HTML.

### Docker, zależności i CI

Obrazy i workflow używają Node.js 24. Zachowano etykiety OCI, tagi `sha-<commit>`, materializację `@rybbit/shared`, standalone Next.js oraz zależności forka `bullmq`, `twilio` i `undici`. Workflow pull requestów wykonuje testy i bramki bez publikowania obrazów; publikacja pozostaje ograniczona do pushu na właściwe gałęzie.

### Ochrona wdrożenia

Wrapper aktualizacji najpierw wymaga czystego repo, fast-forwarduje do dokładnego SHA remote i dopiero wtedy uruchamia aktualną wersję wewnętrznego skryptu. Jeżeli sam skrypt wdrożeniowy fast-forwarduje branch, wykonuje `exec` swojej nowej wersji przed buildem, migracją lub operacją na kontenerach. Eliminuje to uruchamianie starej logiki po aktualizacji repo.

Preflight porównuje przed i po wdrożeniu:

- użytkowników i strony PostgreSQL,
- liczbę, najstarszy i najnowszy event,
- unikalne sesje i sesje dzienne,
- eventy i sesje Replay,
- sesje w legacy i v2 tabeli metadanych Replay.

Pierwszy deploy toleruje brak tabeli v2 wyłącznie jako bazowe zero. Kolejne wdrożenia wykrywają jej spadek. Zachowane są wcześniejsze kontrole projektu Compose, external volume, rzeczywistych mountów i izolacji Redisa.

## Wyniki walidacji lokalnej

Walidację wykonano na Node.js `24.19.0` i npm `11.17.0`. Przed utworzeniem merge commita uzyskano następujące wyniki:

- `shared`: czysta instalacja zależności i build TypeScript zakończone powodzeniem,
- backend: TypeScript bez emisji, `120` plików testowych i `1744` testy zakończone powodzeniem, `db:check`, pełny build, regeneracja trackera i `check:analytics` zakończone powodzeniem,
- klient: TypeScript bez emisji, `24` pliki testowe i `340` testów zakończonych powodzeniem, lint bez błędów, Knip, audyt `2138` komunikatów PL, kontrola formatowania i produkcyjny build Next.js zakończone powodzeniem,
- dokumentacja: produkcyjny build `4450` stron zakończony powodzeniem,
- deployment tooling: `23` testy Pythona i `bash -n` dla skryptów zakończone powodzeniem,
- konfiguracja: pliki Compose i workflow przechodzą parser YAML, a zmienione workflow przechodzą kontrolę formatowania,
- niemutujący `npm audit --omit=dev`: backend `44` advisory (`25` moderate, `17` high, `2` critical), klient `8` high, docs `4` moderate i `5` high; wynik scalonego drzewa jest identyczny z dotychczasowym `feat/wotcv`, więc merge nie zwiększa tego długu, ale jego usunięcie wymaga osobnej aktualizacji zależności,
- repozytorium: brak markerów konfliktu, brak wpisów unmerged, brak zmian poza indeksem i czysty `git diff --check`,
- migracje: snapshot `0014` i journal są zgodne z `feat/wotcv`, kolizyjna `0014_huge_dagger.sql` jest nieobecna, a `db:check` przechodzi,
- Identity Resolution v2: w kodzie wykonawczym nie ma `identityBackfillQueue` ani historycznych mutacji `ALTER TABLE ... UPDATE`,
- katalogi tłumaczeń klienta zachowują wszystkie wartości WoT-CV poza jednym usuniętym przez upstream nieużywanym kluczem; katalogi dokumentacji są semantycznie i bajtowo zgodne z `master`.

Lokalny host nie udostępnia Docker CLI. Z tego powodu renderowanie efektywnej konfiguracji przez `docker compose config`, build obrazów i test kontenerów pozostają obowiązkową bramką workflow `Build WoT-CV Images` oraz serwera docelowego. Sam parser YAML nie zastępuje tej kontroli. Podczas lokalnego wyrównania nie uruchomiono migracji, backfillu, `TRUNCATE`, `DROP TABLE`, kontenerów, pushu ani deployu.

Dokładny SHA merge i potwierdzenie obu rodziców oraz ancestry są raportowane w handoffie po utworzeniu commita; commit zawierający ten dokument jest jedynym merge commitem tej synchronizacji.

## Wymagania przed wdrożeniem

1. Wykonać backup PostgreSQL, ClickHouse i Redis oraz zachować wynik `docker volume inspect` i `docker inspect ... .Mounts`.
2. Potwierdzić ciągłość historycznych eventów i sesji na produkcji, w tym dane sprzed 5 sierpnia.
3. Wdrożyć dokładny SHA przez `WOTCV_EXPECTED_SHA` z `REPLAY_METADATA_MODE=v1`.
4. Po wdrożeniu sprawdzić health, źródło AGPL, logi, dashboardy, identity, Replay i zakres dat.
5. Nie łączyć zwykłego deployu z migracją Replay v2. Cutover wykonać później jako osobne okno operacyjne.
