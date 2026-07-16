# Synchronizacja upstreamu z 2026-07-16

## Zakres

- Gałąź docelowa: `feat/wotcv` (`7fb7a7d1` przed synchronizacją).
- Źródło: `origin/master` (`5f3b5e1a`), wyrównane z głównym repozytorium Rybbit.
- Wspólna baza: `70104a76`.
- Różnica przed merge: 104 commity tylko w `feat/wotcv` i 16 commitów tylko w `origin/master`.
- Obie strony zmieniały 44 te same ścieżki; właściwy merge zatrzymał się na 22 konfliktach.
- Lokalna gałąź bezpieczeństwa: `backup/feat-wotcv-clean-before-master-20260716`.
- Integrację wykonano w osobnym worktree na gałęzi `integration/master-5f3b5e1a`.

## Plan i sposób integracji

1. Zamrozić oba wejściowe SHA, potwierdzić czyste drzewo i utworzyć backup gałęzi forka.
2. Wykonać merge `--no-ff --no-commit` w osobnym worktree.
3. Rozwiązać konflikty semantycznie: przyjąć nowe kontrakty upstreamu i ponownie nałożyć rozszerzenia WoT-CV.
4. Uzgodnić liniową historię Drizzle bez uruchamiania migracji na bazie produkcyjnej.
5. Scalić katalogi językowe klucz po kluczu, uruchomić extractor i audyt języka polskiego.
6. Przebudować generowane skrypty trackera z połączonych źródeł.
7. Zweryfikować shared, serwer, klienta, migracje, skrypty wdrożeniowe i efektywny Compose.
8. Dopiero po wdrożeniu testowym i smoke testach utworzyć merge commit i zaktualizować `feat/wotcv`.

## Changelog upstreamu

### Analityka i autocapture

- Dodano API, hooki i widoki dla zdarzeń autocapture.
- Rozszerzono schemat zdarzeń oraz tracking kliknięć, kopiowania, wysyłania formularzy i zmian pól.
- Uspójniono zapytania analityczne, journeys, dashboardy i formularz lejków.
- Rozszerzono testy trackera, Session Replay i usług sesji.

### Użytkownicy i sesje

- Przebudowano profil użytkownika: nagłówek, statystyki, lokalizacja i urządzenia, journeys, top pages oraz paginacja sesji.
- Dodano identyfikowanie i usuwanie użytkownika oraz edycję traits.
- Rozszerzono API użytkowników i synchronizację tożsamości między trackingiem, sesjami i replayem.

### API keys, autoryzacja i MCP

- Dodano scope'y API keys, bearer auth i kontrolę dostępu `read`/`write` w middleware.
- Dodano serwer MCP pod `/api/mcp`, discovery OAuth oraz narzędzia dla analityki, funnels, goals, organizacji, raw data, sites i users.
- Dodano tabele OAuth, testy autoryzacji oraz dokumentację MCP.
- Rozbudowano ekran zarządzania kluczami API o wybór scope'ów.

### Deployment, panel administracyjny i dokumentacja

- Ograniczono domyślne porty usług do localhost i poprawiono budowanie obrazu serwera z `@rybbit/shared`.
- Zmieniono inicjalizację strony administracyjnej tak, aby panel był dostępny także poza wdrożeniem cloud.
- Zaktualizowano tłumaczenia wszystkich obsługiwanych języków.
- Dodano sponsora `serverlist.dev` i poprawiono metadane Open Graph.

## Decyzje integracyjne WoT-CV

- Zachowano migrację `0010_uneven_juggernaut` z konfiguracją Network Replay. Upstreamową migrację OAuth/MCP przenumerowano na `0011_tiny_diamondback`; snapshot i journal zachowują liniową kolejność obu zmian.
- Zachowano Growth Accounting, eksport Session Replay, Network Replay, metadane `wotcv/replay-config` oraz rozszerzony lifecycle recordera.
- Nowe endpointy korzystają z aktualnego middleware scope'ów, a funkcje WoT-CV otrzymały odpowiadające im uprawnienia `replay:read` i `replay:write`.
- Nowy profil użytkownika i karty sesji nadal korzystają z `getUserDisplayName()` oraz bezpiecznych adresów avatarów WoT-CV.
- Zachowano runtime capabilities forka zamiast ponownie blokować funkcje self-hosted przez `IS_CLOUD`.
- Inicjalizacja ClickHouse dla liczników panelu administracyjnego pozostaje bezwarunkowa. Zapytania używają wspólnej usługi z kontrolowanym fallbackiem, więc brak rollupu nie kończy `/api/admin/sites` błędem 500.
- Katalogi językowe oparto na wcześniej sprawdzonym scaleniu, nałożono wyłącznie różnicę z najnowszego upstreamu i ponownie wygenerowano extractorem.
- Redis nie publikuje już `6379` na hoście. Postgres zachowuje domyślne mapowanie WoT-CV `127.0.0.1:5433:5432`.
- Deployment waliduje efektywny Compose, faktyczne mapowania portów i stan infrastruktury, a następnie odtwarza wyłącznie backend oraz client z `--no-deps`. Start i health check korzystają z automatycznego rollbacku.

## Walidacja lokalna

- `shared`: `npm run build`.
- `server`: `npm run test:run` (47 plików, 442 testy), `npm run db:check`, `npm run build`, `npm run build:analytics` i `npm run check:analytics`.
- `client`: `npm run test:run` (6 plików, 19 testów), `npx tsc --noEmit`, lint wszystkich zmienionych plików (0 błędów), Prettier wszystkich zmienionych plików oraz `npm run build`.
- Tłumaczenia: 2115 komunikatów, 0 brakujących, 0 nadmiarowych, 0 pustych i 0 niezgodności placeholderów ICU.
- Skrypty `server/public/script.js` i `server/public/script-full.js` przebudowano z połączonych źródeł.
- Skrypty wdrożeniowe przechodzą `bash -n` w Git Bash.
- Nie uruchamiano migracji produkcyjnej, nie tworzono merge commita i nie wykonywano pushowania.

## Walidacja wymagana na Ubuntu przed wdrożeniem

1. Uruchomić `bash -n` dla skryptów wdrożeniowych.
2. Wygenerować efektywny Compose i potwierdzić, że Redis nie ma portu hosta, a pozostałe publikowane porty używają loopback.
3. Jednorazowo odtworzyć wyłącznie kontener Redis z nowym overlayem, zachowując volume `rybbit_redis-data`.
4. Potwierdzić stan `healthy` dla Postgresa, ClickHouse i Redisa oraz połączenie `backend -> redis:6379`.
5. Wykonać backup danych, uruchomić deploy i sprawdzić migracje w logach backendu.
6. Sprawdzić lokalny i publiczny health endpoint, `/api/admin/sites`, dashboard, tracking, Session Replay i eksport.

## Znane ostrzeżenia

- React Compiler pomija memoizację trzech zmienionych komponentów używających API TanStack Table/Virtual; lint nie raportuje błędów.
- Lokalny build Next.js wypisuje nieblokujący błąd względnego `/api/auth/get-session`, gdy nie ma produkcyjnego URL backendu; build kończy się kodem 0.
- Pełny lint i format całego klienta zawierają wcześniejszy baseline spoza zakresu merge; wszystkie pliki zmienione przez synchronizację zostały sprawdzone osobno.
- Docker CLI nie jest dostępny w środowisku Windows, dlatego efektywny Compose oraz obrazy muszą zostać zweryfikowane na Ubuntu.
- `npm ci` raportuje 49 znanych podatności zależności serwera i 7 klienta. Nie uruchamiano `npm audit fix`, ponieważ automatyczna zmiana wersji mogłaby wyjść poza zakres synchronizacji.
- Obrazy nadal bazują na Node.js 20, podczas gdy część pakietów `@react-email` deklaruje Node.js 22 lub nowszy. Build przechodzi, ale aktualizacja obrazu bazowego wymaga osobnej decyzji i testów regresji.

## Korekta po merge: Identity Resolution v2

Po wdrożeniu merge commita `ce8f7c47` potwierdzono wcześniejszy błąd modelu tożsamości: lista użytkowników i globus grupowały historię po anonimowym `user_id`, podczas gdy widok szczegółów potrafił już odnaleźć alias wskazujący zidentyfikowane konto. Dotychczasowe `ALTER TABLE ... UPDATE` próbowały naprawiać dane asynchronicznymi mutacjami ClickHouse, co nie gwarantowało spójności wszystkich widoków i było kosztowne dla tabel faktów.

W poprawce zastosowano następujący model:

- PostgreSQL `user_aliases` jest źródłem prawdy dla mapowania `(site_id, anonymous_id) -> user_id`.
- ClickHouse odczytuje aliasy przez zewnętrzny słownik `user_identity_dict`; jawny `identified_user_id` zapisany w zdarzeniu ma pierwszeństwo, potem używany jest alias, a dopiero na końcu anonimowy `user_id`.
- Historyczne zdarzenia i replaye pozostają niemutowalne. Rejestracja lub logowanie natychmiast koreluje wcześniejszą historię tej samej przeglądarki po odświeżeniu słownika, bez przepisywania tabel ClickHouse.
- Tracker używa stabilnego, losowego identyfikatora przeglądarki, obraca go po wylogowaniu i zmianie konta oraz nie pozwala przejąć aliasu należącego do innego użytkownika.
- Zapytania użytkowników, cech, sesji, globusa, replayów, lejków, retencji i Growth Accounting korzystają z jednego sposobu rozwiązywania tożsamości.
- Flaga `IDENTITY_RESOLUTION_V2=false` zapewnia awaryjny rollback logiki odczytu bez cofania addytywnej migracji PostgreSQL.

Deployment został rozszerzony o kontrolowaną kolejność: walidacja portów, ewentualne odtworzenie wyłącznie kontenera Redis bez publikacji `6379`, build obrazów, migracja PostgreSQL, odtworzenie ClickHouse z konfiguracją słownika, start aplikacji, health check i preflight. Preflight potwierdza schemat aliasów, status słownika, przykładowe mapowanie PostgreSQL -> ClickHouse, izolację Redis oraz uruchomione SHA obrazów.

Po pierwszym wdrożeniu doprecyzowano bramkę gotowości kontenerów: preflight czeka teraz do 120 sekund na przejście healthchecka ze stanu `starting` do `healthy`. Zapobiega to fałszywemu rollbackowi, gdy endpoint backendu już odpowiada, ale Docker nie zapisał jeszcze pierwszego udanego healthchecka.

Walidacja poprawki:

- `server`: 50 plików testowych i 457 testów, TypeScript, Drizzle check oraz build przeszły poprawnie.
- `client`: 6 plików testowych i 19 testów, TypeScript oraz produkcyjny build Next.js 16.2.6 przeszły poprawnie.
- `shared`: build TypeScript przeszedł poprawnie.
- Skrypty trackera przebudowano ze źródeł i sprawdzono deterministyczność artefaktów.
- Oba skrypty wdrożeniowe przechodzą `bash -n`; rzeczywisty Compose, migracja i słownik wymagają końcowego preflightu na Ubuntu z Dockerem.
