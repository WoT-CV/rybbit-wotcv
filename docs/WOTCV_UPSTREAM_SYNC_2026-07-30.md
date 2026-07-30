# Synchronizacja upstreamu z 2026-07-30

## Zakres

- Gałąź docelowa: `feat/wotcv` (`ac983d3e` przed synchronizacją).
- Źródło: `origin/master` (`1a858fb3`), zaktualizowane z głównego projektu Rybbit.
- Wspólna baza: `b221e13f`.
- Przed merge `feat/wotcv` zawierał 117 własnych commitów, a `origin/master` 43 własne commity.
- Merge `--no-ff --no-commit` zatrzymał się na 31 konfliktach.
- Lokalna gałąź bezpieczeństwa: `backup/feat-wotcv-before-master-20260730-1a858fb3`.
- Integrację wykonano w osobnym worktree na gałęzi `integration/master-1a858fb3`.

## Najważniejsze zmiany upstreamu

- Wydanie Rybbit 2.8, aktualizacja Next.js i zależności `better-auth`.
- Wykluczenia ruchu po ASN i parametrach zapytania.
- Sticky user ID, poprawki identyfikacji użytkowników oraz zliczania analytics.
- Modułowa inicjalizacja schematu ClickHouse i ustawienia async insert.
- Warunkowe pobieranie feature flags w trackerze wraz z timeoutami.
- Rozszerzone wykrywanie botów i diagnostyka ASN.
- Wyłączanie osadzonego dashboardu i poprawki widżetu embed.
- Konfiguracja backupów ClickHouse/PostgreSQL do Backblaze B2.
- Poprawki lejków, sidebara, proxy guides i tłumaczeń.

## Decyzje integracyjne WoT-CV

### Migracje i schemat

- Zachowano linię migracji WoT-CV do `0013_upstream_api_keys_first_party_proxy`.
- Kolumny upstreamu `excluded_asns` i `excluded_query_params` przeniesiono do nowej, addytywnej migracji `0014_upstream_site_exclusions`.
- Migracja używa `ADD COLUMN IF NOT EXISTS`, aby bezpiecznie obsłużyć środowisko, w którym analogiczne kolumny mogły już zostać dodane.
- Snapshot `0014_snapshot.json` wygenerowano z połączonego schematu, a journal ma ciągłe indeksy `0..14`.
- Nie uruchamiano migracji na żadnej bazie danych.

### Identity Resolution v2

- Zachowano źródło prawdy WoT-CV w PostgreSQL oraz słownik ClickHouse `user_identity_dict`.
- Nowy upstreamowy helper `effectiveUserId` deleguje do mechanizmu WoT-CV: jawny `identified_user_id` ma pierwszeństwo, następnie używany jest alias ze słownika, a na końcu anonimowy `user_id`.
- Nowe zapytania overview, live users, PDF i raporty tygodniowe korzystają dzięki temu z tego samego modelu tożsamości co istniejące zapytania users, sessions, replay, retention i funnels.
- Widok użytkownika nadal przekazuje kanoniczne ID i komplet anonimowych aliasów do sesji, journeys oraz top pages.

### ClickHouse i Redis

- Przyjęto modułową inicjalizację ClickHouse z upstreamu, zachowując inicjalizację rollupu administracyjnego WoT-CV oraz kontrolę gotowości słownika tożsamości.
- Redis zawiera jednocześnie istniejące rozwiązywanie zidentyfikowanej sesji WoT-CV i nowy izolowany mechanizm sticky resolve z upstreamu.
- Zachowano konfigurację słownika ClickHouse, ustawienia async insert i overlay Compose WoT-CV bez publikowania portu Redis na hoście.

### Tracker i Session Replay

- Tracker zachowuje losowy identyfikator przeglądarki, rotację aliasu, Network Replay, retry identyfikacji i banner licencyjny WoT-CV.
- Jednocześnie przyjęto timeouty i runtime gating feature flags oraz nowe sygnały wykrywania botów.
- `getTrackingConfig` zwraca zarówno znormalizowaną konfigurację Network Replay, jak i `featureFlagsEnabled`.
- `script.js` oraz `script-full.js` wygenerowano ponownie z połączonych źródeł i sprawdzono ich deterministyczność.

### Klient i lokalizacje

- Session Replay jest ukrywany w środowisku demo, ale zachowuje szeroki układ, mobilny drawer i tłumaczenia WoT-CV.
- Sprawdzenie środowiska demo umieszczono w komponencie opakowującym, dzięki czemu żaden hook nie jest wywoływany warunkowo.
- Sidebar zachowuje capability flags WoT-CV, a jednocześnie przyjmuje responsywny layout i regułę ukrywania replay w demo.
- Katalogi 12 języków scalono klucz po kluczu; dla istniejących kluczy pierwszeństwo miały sprawdzone tłumaczenia forka.
- Extractor dodał nowe klucze upstreamu. Sześć nowych komunikatów dotyczących wyłączenia osadzania dashboardu otrzymało polskie tłumaczenia.

### Zależności i Compose

- Lockfile serwera i klienta odtworzono z połączonych manifestów, bez automatycznego `npm audit fix`.
- Overlay WoT-CV nadal usuwa publikację portu Redis, ustawia Postgresa na `127.0.0.1:5433:5432` i wskazuje obrazy WoT-CV oznaczone niezmiennym tagiem SHA.
- Oba pliki Compose przechodzą parsowanie YAML z obsługą tagów Compose `!reset` i `!override`.

## Walidacja lokalna

- `shared`: `npm run build`.
- `server`: build TypeScript i trackera, `npm run db:check` oraz `npm run check:analytics`.
- `server`: wszystkie 92 pliki testowe i wszystkie 1162 testy mają poprawne asercje. Pełny proces Vitest nadal zwraca kod 1 przez znany błąd sprzątania socketów w `mcp.test.ts`; po wyłączeniu tylko tego pliku 91 plików i 1131 testów przechodzi z kodem 0.
- `client`: 12 plików testowych i 70 testów, `npx tsc --noEmit` oraz produkcyjny build Next.js 16.2.6.
- `client`: `lint:wotcv` ma 0 błędów i 2 ostrzeżenia TanStack Virtual. Ręcznie scalane replay, profil użytkownika i sidebar przechodzą ESLint bez błędów i ostrzeżeń.
- Tłumaczenia: 2139 komunikatów, 0 brakujących, 0 nadmiarowych, 0 pustych i 0 niezgodności placeholderów ICU.
- Ręcznie scalane pliki klienta i serwera sformatowano i sprawdzono Prettierem.

## Znane ostrzeżenia

- Pełny `npm run test:run` serwera ma niestabilny błąd cleanup w `@hono/node-server`: `socket.destroySoon is not a function`. Ten sam problem występował przed synchronizacją; testy MCP i wszystkie ich asercje przechodzą.
- Pełny lint klienta raportuje 82 błędy i 157 ostrzeżeń w szerokim kodzie repozytorium, głównie po włączeniu reguł React Compiler. Zakres ręcznie scalany oraz zakres WOT-CV nie mają błędów.
- Globalne kontrole Prettier i Knip raportują istniejący dług całego repozytorium. Nie wykonano masowego formatowania ani usuwania publicznych eksportów niezwiązanych z merge.
- Build klienta kończy się kodem 0, ale bez produkcyjnego URL backendu wypisuje nieblokujący błąd względnego `/api/auth/get-session`.
- `npm ci` raportuje 47 znanych podatności zależności serwera oraz 9 klienta.
- Docker CLI i Bash nie są dostępne w lokalnym środowisku Windows. Nie wykonano efektywnego `docker compose config` ani `bash -n` nowych skryptów backupu.

## Kontrole wymagane przed wdrożeniem

1. Na Ubuntu uruchomić `docker compose config` dla bazowego Compose i overlaya WoT-CV.
2. Potwierdzić brak portu hosta Redis, mapowanie Postgresa `127.0.0.1:5433:5432`, mount słownika ClickHouse oraz ustawienia async insert.
3. Uruchomić `bash -n` i test timeoutu nowych skryptów backupu.
4. Wykonać backup danych przed uruchomieniem migracji `0014`.
5. Po migracji sprawdzić gotowość `user_identity_dict`, sticky resolve i mapowanie aliasów PostgreSQL -> ClickHouse.
6. Wykonać smoke test trackingu, identify/logout, feature flags, dashboardów, wykluczeń ASN/query params, Session Replay i Network Replay.
7. Dopiero po tych kontrolach wdrożyć obrazy i wykonać ewentualny push gałęzi.
