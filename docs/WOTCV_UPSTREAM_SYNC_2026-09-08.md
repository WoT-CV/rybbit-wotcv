# Synchronizacja master do feat/wotcv — 2026-09-08

## Zakres i zamrożone wejścia

Analiza dotyczy integracji kodu, nie wdrożenia. Dostęp do produkcji jest wyłącznie do odczytu. W tej operacji nie uruchamiamy migracji baz, backfillu, restartów kontenerów ani aktualizacji serwera. Nie wykonujemy pushu.

- WoT-CV przed integracją: `7622e4522559e7bbbcc923df423b45eddab9ed3f`.
- Źródło: `origin/master` = `31009572aa0a481f41e208c61ec3126b35819fb4`.
- Wspólna baza: `0833ad165c8255ecf21a7a1ee40114cf7beabddf`.
- Rozbieżność historii: 126 commitów tylko po stronie forka, 53 tylko po stronie master.
- Zmiany od bazy: 494 ścieżki forka, 396 upstreamu, 67 ścieżek wspólnych.
- Backup Git: `backup/feat-wotcv-7622e452-before-master-31009572`.
- Gałąź integracyjna: `integration/master-31009572-into-wotcv-20260908`.
- Izolowany worktree: `C:\PROJECTS\rybbit-wotcv-merge-31009572-20260908`.

Lokalny `master` jest starszy niż remote. Źródłem integracji jest zamrożony SHA `origin/master`, nie lokalny master. Czysty stan wejściowy i fetch zostały potwierdzone przed utworzeniem worktree.

## Analiza różnic i ryzyka

| Obszar | Zmiany master | Obowiązek integracyjny WoT-CV |
| --- | --- | --- |
| PostgreSQL | Migracje 0015–0017: lifecycle email log, platforma strony, zapisane segmenty, adnotacje | Zachować wszystkie wcześniejsze SQL/journal forka; nowe snapshoty muszą kontynuować forkowy 0014, zawierać Network Replay, identity i Uptime. Sam bezkonfliktowy merge JSON nie potwierdza zgodności schematu. |
| ClickHouse | Addytywne `events.timestamp_ms` z fallbackiem do sekund, cztery kolumny identyfikacji botów | Zachować istniejące klucze, historię, TTL i tabele Replay v1/v2; nie materializować ani przepisywać historycznych danych. |
| Custom SQL | Ograniczony użytkownik `rybbit_query`, provisioning na starcie, zaostrzenie walidatora | Przyjąć zabezpieczenia; zachować działanie dedykowanych kart Growth Accounting i zaufanych zapytań identity. Nie udostępniać słownika ani tabel użytkownika dowolnemu SQL. |
| Sesje i tożsamość | Wspólny helper filtrów sesji, milisekundowe porządkowanie eventów | Połączyć nowe filtry z `effectiveUserId`, słownikiem i ograniczeniem site. Nie wrócić do historycznych mutacji identity ani utraty anonimowej historii w wynikach. |
| Replay | Etykiety kliknięć przypisane do snapshotu i dodatkowe testy | Zachować parser Network Replay, adapter playera, autoplay, seek, aktywność, eksport i obie rodziny testów. Domyślnie nadal `REPLAY_METADATA_MODE=v1`. |
| Daty i wykresy | Nowy picker, presety/hotkeys, porównania, tygodniowe/miesięczne bucketowanie, adnotacje | Sprawdzić strefy czasowe, granice okresów, query keys, eksporty i własne karty Growth Accounting. |
| Segmenty i adnotacje | API CRUD, scope API keys, public/private, menu ustawień i wykresu | Zachować granice organizacji/site oraz capabilities self-hosted, GSC i Network Replay w ustawieniach. |
| Boty | Nazwy/operatorzy AI, cel crawler/agent, baseline detekcji flood | Zachować self-hosted dostępność, warstwy detekcji i szczegółowe wyjaśnienia WoT-CV. |
| Marketing i auth | Nowy automat lifecycle email, usunięte stare sekwencje | Self-hosted nadal nie wysyła marketingu; skonfigurowany e-mail transakcyjny i raporty tygodniowe pozostają dostępne niezależnie od cloud. |
| Tracker | Site ID z URL skryptu, nowe kontrakty i kolejność zdarzeń | Zachować anonymous ID, rotację kont, Network Replay, zgodność konfiguracji, AGPL i prekompresję. Artefakty generować po scaleniu źródeł. |
| Awatary i globus | Ulepszone lokalne żaby i mapa OpenFreeMap | Zachować bezpieczne avatarUrl, nazwy/traits i escaping HTML w tooltipach. |
| Lokalizacja | Wiele nowych kluczy oraz globalne przestawienie katalogów | Scalać semantycznie po kluczu, nie markerami tekstowymi; nie nadpisywać polskich wartości pustymi wpisami. Extractor po scaleniu kodu, potem uzupełnienie PL i audyt. |
| Build/Compose/CI | Env deployment, uprawnienia provisioning CH, testy HTTP dokumentacji | Zachować Node 24, metadane SHA/OCI, shared, Chromium/ffmpeg, dokładny projekt i external volumes, loopback oraz brak portu Redisa. |
| Dokumentacja | Landing variants i endpointy agent-friendly | Przyjąć upstream; sprawdzić build i nowe testy. Nie mieszać z konfiguracją produkcyjnego trackera. |
| Ochrona deployu | Brak nowej poprawki upstream dla walidacji WoT-CV | Zachować commit 7622e452: zakotwiczona kohorta 29 dni i limit 6 h, self-refresh skryptów oraz twarde kontrole wolumenów. |

### Czego wcześniejsze logi produkcyjne nie dowodzą

Logi z sierpnia potwierdziły istnienie eventów od 9 lipca i pokazują TTL 30 dni na Replay. Spadek pełnego licznika Replay podczas deployu jest zgodny z TTL, ale sam wzrost późniejszego licznika nie dowodzi zachowania każdego rekordu. Brak `system.part_log` uniemożliwił przypisanie dokładnych 458 wierszy do konkretnego merge TTL. Historyczna mutacja `_row_exists = 0` dla site 1 wymaga osobnego kontekstu operacyjnego; nie wolno opisywać wszystkich mutacji jako wyłącznie aktualizacji identity. Bieżąca synchronizacja nie ma służyć do przywracania ani usuwania danych.

## Szczegółowy plan wykonania

1. Zamrozić oba SHA, potwierdzić czysty working tree i brak aktywnego merge/rebase. Utworzyć backup Git i worktree integracyjny. Zachować oryginalny checkout bez zmian do czasu walidacji.
2. Wykonać próbne `merge-tree`, spisać konflikty i przejrzeć także ścieżki scalane automatycznie. Rozróżnić konflikty generowanych artefaktów od konfliktów kontraktów.
3. W worktree rozpocząć normalny merge `--no-ff --no-commit` dokładnego SHA master. Bez squash, rebase, force-push ani strategii wyboru całych katalogów.
4. Uzgodnić `shared`, schemat PostgreSQL i ClickHouse przed klientem i API. Połączyć nowe typy z typami sieci/replay/identity. Porównać stare migracje bajtowo z baseline.
5. Przyjąć nowe addytywne SQL 0015–0017, nie przyjmować pominiętej wcześniej upstreamowej migracji 0014. Przebudować linię nowych snapshotów jako delta upstreamu na forkowym 0014. Potwierdzić spójne `id`/`prevId`, unikalny journal oraz zgodność końcowego schematu. Nie uruchamiać migracji na bazie.
6. Przyjąć provisioning least-privilege CH i env w Compose, przejrzeć granice uprawnień i brak fallbacku do uprzywilejowanego klienta dla SQL użytkownika. Oddzielić zaufane karty wbudowane.
7. Scalić helper filtrów sesji z identity v2. Sprawdzić listę użytkowników, user info, session count, sesje, lokalizacje, funnel sessions i główny filter builder. Rozszerzyć testy miejsc, gdzie połączenie nowego kodu z rozszerzeniami forka może ominąć słownik.
8. Scalić entrypoint, auth i lifecycle usług. Usunąć martwe importy starych email services, zachować cloud-only marketing i warunkowe usługi transakcyjne, raporty oraz forkowy eksport Replay.
9. Scalić UI botów, ustawienia, sidebar, dashboardy i tooltip globusa. Zachować capability gates, polskie etykiety, custom avatar i Growth Accounting, przyjmując nowe kontrolki/upstream API.
10. Połączyć oba zestawy testów parsera Replay. Sprawdzić klikanie po nawigacji/snapshotach, sieć, player, seek i eksport. Nie zmieniać trybu metadanych ani retencji.
11. Katalogi locale scalić po kluczach z bazą trójstronną: zachować forkowe niepuste zmiany, przyjąć nowe upstreamowe klucze/wartości, zgłosić rzeczywiste konflikty wartości. Uruchomić extractor, uzupełnić nowy PL, audyt placeholderów i kompletności.
12. Zaktualizować lockfile wyłącznie do scalonych manifestów; używać npm zgodnie z repo, nie migrować na Yarn. Wykonać czyste instalacje w worktree, nie nadpisywać zależności bazowego checkoutu.
13. Zbudować shared, wykonać tsc i pełne testy backendu/klienta z ograniczoną liczbą workerów. Uruchomić db:check (bez połączenia/migracji), audyt PL, lint/Knip/format forka. Rozróżnić nowe regresje od wcześniejszego długu.
14. Zbudować backend, wygenerować tracker i prekompresję; uruchomić check:analytics. Zbudować klienta i docs, uruchomić nowe testy docs agent-readiness/HTTP.
15. Sprawdzić składnię Bash, testy ochrony persistence i parser YAML. Docker build/Compose config wykonywać tylko lokalnie, jeśli narzędzia są dostępne; nie używać produkcji jako środowiska testów.
16. Porównać wynik z oboma rodzicami: wszystkie nowe upstreamowe pliki, wszystkie forkowe kontrakty, historia migracji, brak markerów/entries unmerged, diff --check. Udokumentować każdą celową różnicę i zakres dowodów.
17. Przenieść zweryfikowany wynik na feat/wotcv bez przepisywania historii i bez pushu. Raport rozróżnia kod lokalny, commity, publikację i faktycznie uruchomione obrazy. Nie twierdzić, że produkcja została zaktualizowana.

## Plan wdrożenia po publikacji (nie wykonywany podczas integracji)

1. Potwierdzić aktualny SHA aplikacji, project/mounty i zdrowie usług; zachować wyniki i backup PostgreSQL/ClickHouse/Redis z możliwością odtworzenia. Liczniki kontrolne nie zastępują backupu.
2. Użyć aktualnej wersji launchera z repo, unikając starego procesu Bash po git fast-forward. Wskazać dokładny `WOTCV_EXPECTED_SHA` opublikowanego commita.
3. Pozostawić `REPLAY_METADATA_MODE=v1` (chyba że osobny, udokumentowany rollout już zmienił produkcję). Nie uruchamiać backfillu Replay ani identity.
4. Standardowy deploy sam uruchamia `db:migrate` z nowego obrazu przed uruchomieniem nowego backendu; dla bazy na stanie baseline będą to 0015–0017. Nie wykonywać ręcznie db:push ani generowania migracji na serwerze.
5. ClickHouse przy starcie backendu dostaje addytywne kolumny i provisioning użytkownika SQL. Obecny użytkownik CH musi mieć access_management; efektywny Compose przekazuje `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1`. Opcjonalne `CLICKHOUSE_QUERY_PASSWORD` domyślnie dziedziczy hasło główne.
6. Sprawdzić health z dokładnym SHA, preflight identity, kohorty przed/po, ciągłość historii i sesje sprzed 5 sierpnia. Sam status healthy nie jest testem historii danych ani custom SQL.
7. Smoke: logowanie/wylogowanie/zmiana konta, stare i nowe sesje/Replay, Network Replay, eksport do 2 minut, PL, Growth Accounting, Pages/Performance/Bots, nowy date picker, segmenty/adnotacje, custom query/dashboard.
8. Przy regresji aplikacji wrócić do poprzednich obrazów bez down -v, usuwania volume, cofania addytywnego schematu ani uruchamiania backfillu. Spadek chronionej kohorty wymaga zatrzymania procedury i wyjaśnienia, nie wyłączenia walidacji.

## Wyniki wykonania

### Rozwiązane konflikty i dodatkowe poprawki

Merge miał 39 konfliktujących ścieżek, w tym 12 katalogów językowych. Rozwiązano wszystkie wpisy unmerged. Nie wybierano zbiorczo `ours`/`theirs` dla katalogów aplikacji.

1. **Historia PostgreSQL:** nowe SQL 0015–0017 przyjęto bez zmiany ich treści. Snapshoty odbudowano jako addytywne delty na forkowym 0014: zachowano 35 istniejących tabel, dochodząc kolejno do 36, 37 i 38. Żaden istniejący artefakt migracji nie został zmieniony; journal ma wyłącznie dopisane nowe wpisy. Dodano cztery testy linii snapshotów, zgodności ze schematem TypeScript i zachowania wcześniejszych definicji.
2. **Identity i sesje:** nowe filtrowanie kohort sesji korzysta z rozwiązanego ID w agregacie, a nie z nieistniejącego `site_id` w jego zewnętrznym filtrze. Zapytania profilu kwalifikują identity aliasem `source_events`. Lista i licznik użytkowników zachowują słownik; odczyty pojedynczego użytkownika nadal przekazują canonical ID i anonimowe aliasy z PostgreSQL. Kalendarz liczy sesję według dnia jej rozpoczęcia, nie ponownie dla każdego dnia przekroczonego przez sesję.
3. **Filtry feature flags:** uzupełniono projekcję `feature_flags` w agregacie listy sesji. Wcześniejszy brak mógł powodować odwołanie zewnętrznego filtra do nieistniejącej kolumny. Dodano regresje łączące identity, pathname i feature flags oraz sprawdzające zachowanie pełnej historii.
4. **Zabezpieczenie konta ClickHouse:** przed provisioningiem ograniczonego użytkownika odrzucana jest nazwa zgodna z kontem głównym lub `default`. Zapobiega to wykonaniu na koncie ingestu poleceń zmiany hasła i `REVOKE ALL` przy błędnej konfiguracji. Nie zmieniono uprawnień zaufanych zapytań identity ani nie przyznano słownika Custom SQL.
5. **Persistence:** każdy błąd odczytu czasu, podstawowych invariantów, istnienia tabeli v2 i jej liczników jest propagowany, również w kontekście Bash z wyłączonym `errexit` oraz po częściowym stdout. Zero dla v2 jest dopuszczalne wyłącznie po poprawnej odpowiedzi `EXISTS = 0`. Dodano testy shellowe z atrapą Dockera; nie wyłączono ani nie złagodzono kontroli kohorty TTL.
6. **CI:** poprawiono kontrolę składni wszystkich pięciu skryptów przez pętlę `bash -n`; wcześniejsze jedno wywołanie sprawdzało tylko pierwszy plik. Zachowano npm/Node 24 i forkowe bramki, przyjęto job dokumentacji oraz jawnie ograniczono token workflow testów do `contents: read`.
7. **Self-hosted i usługi:** zachowano capability gates, GSC, R2, transakcyjne e-maile i opcjonalne raporty tygodniowe. Nowy lifecycle marketing działa tylko pod bramką cloud. Test R2 z mastera dostosowano do świadomie zachowanej obsługi skonfigurowanego self-hosted; brak pełnej konfiguracji nadal nie uruchamia storage.
8. **Replay:** połączono oba zestawy testów etykiet kliknięć i parsera, zachowując Network Replay, eksport i adapter odtwarzacza. Kod usług Replay, identity i recorder Network Replay nie został zastąpiony wersją upstreamu. Nie wykonano backfillu, cutoveru metadata v2 ani zmiany TTL.
9. **PL i interfejs:** katalogi scalono semantycznie z obu rodziców; nowe elementy UI botów AI przeszły przez `useExtracted`. Uzupełniono 31 polskich wartości. Testy dat nie zakładają już angielskiej lokalizacji systemu; osobny test potwierdza polski format adnotacji. Zachowano bezpieczne awatary i escaping tooltipów.
10. **Build i tracker:** odtworzono prawidłowy lockfile backendu dla połączonych zależności (bez podnoszenia wersji utrzymywanych przez fork), wykonano czyste instalacje, zregenerowano tracker z bannerem źródła AGPL oraz prekompresję Brotli/gzip. Obsługa `?siteId=` zachowuje kompatybilność z istniejącym `data-site-id`, więc nie wymaga natychmiastowej zmiany starego snippetu na stronie.
11. **Dokumentacja upstream:** naprawiono niepoprawny YAML frontmatter nowej strony `api/segments/list.mdx`, który blokował produkcyjny build. Wszystkie 218 nagłówków MDX przechodzą parser.

### Potwierdzone wyniki walidacji lokalnej

Wykonane w izolowanym worktree na Windows, Node 24.19.0/npm 11.17.0. Testy regresyjne używają atrap lub lokalnych środowisk testowych, nie produkcji.

| Kontrola | Rzeczywisty wynik |
| --- | --- |
| Czyste instalacje shared/server/client/docs | OK; `npm ci`, dla aplikacji `--legacy-peer-deps` zgodnie z CI |
| Shared build | OK |
| Backend pełny Vitest | **146 plików / 2034 testy OK** |
| Klient pełny Vitest | **37 plików / 523 testy OK** |
| Dodatkowa strefa `Europe/Warsaw`, klient daty/adnotacje | **7 plików / 182 testy OK** |
| Dodatkowa strefa `America/Los_Angeles`, backend czas/identity | **4 pliki / 66 testów OK** |
| Python persistence i regresje Bash | **35 testów OK**, bez pominiętych testów |
| Bash syntax | Wszystkie 5 skryptów OK, osobno; składnia kroku CI również OK |
| PostgreSQL `db:check` | OK; nie jest to wykonanie migracji na bazie |
| Backend TypeScript i build | OK |
| Wygenerowany tracker `check:analytics` | OK, zgodność źródeł i śledzonych artefaktów |
| Prekompresja | OK: script 68 623 B → 18 568 B Brotli / 21 317 B gzip; rrweb i web-vitals również zbudowane |
| Klient TypeScript i produkcyjny build | OK |
| Polski katalog | **2324 komunikaty**, 0 brakujących/pustych/nadmiarowych/błędnych placeholderów |
| `lint:wotcv` | 0 błędów, 2 ostrzeżenia React Compiler dotyczące istniejącego TanStack Virtual |
| `knip` i `format:check:wotcv` | OK; lokalnie znormalizowano LF wymagane przez Prettier |
| Docs agent-readiness | 11 testów OK |
| Docs produkcyjny build + agent HTTP | OK po naprawie frontmatter; rzeczywisty lokalny serwer Next i testy HTTP |
| YAML | 11 plików workflow/Compose poprawnych składniowo, w tym tagi `!reset` / `!override` |
| Historia starych migracji | Brak zmian względem `7622e452`; journal wyłącznie rozszerzony |
| Kompletność nowych plików master | Wszystkie **150/150** obecne |
| Konflikty i whitespace | Brak markerów konfliktu, brak entries unmerged; `git diff --check` OK |

### Ograniczenia i znany dług

- **Pełny ESLint klienta nie jest zielony:** 85 błędów i 166 ostrzeżeń w szerszym zakresie niż utrzymywana bramka `lint:wotcv`. Każdy plik z błędem porównano z treścią obu rodziców przy tej samej konfiguracji ESLint. Porównanie liczby błędów według reguły i nagłówka komunikatu nie wykazało kategorii/liczby powstałej wyłącznie przez rozwiązywanie merge; część długu pochodzi z mastera, część już z forka. Nie wyłączano reguł ani nie przeprowadzano masowego refaktoru React w ramach synchronizacji. Nie jest to deklaracja pełnej poprawności funkcjonalnej tych plików.
- Brak dostępnego lokalnie Dockera: nie wykonano rzeczywistego `docker compose config`, buildów obrazów, startu kontenerów ani smoke z PostgreSQL/ClickHouse. Parser YAML i testy persistence nie zastępują walidacji efektywnego Compose. Workflow obrazu zachowuje tę bramkę do uruchomienia po publikacji.
- SSH z uwierzytelnianiem bez interakcji odmówiło dostępu. Istniejące procesy SSH były tunelami; nie ingerowano w sesje ani w tunelowane bazy. Bieżący stan i dane produkcyjne nie zostały odczytane ani zmienione.
- Nie wykonano migracji PostgreSQL na docelowej bazie, provisioningu użytkownika CH, backfillu, publikacji obrazów, pushu ani wdrożenia. Nie uruchamiano szerokiej aktualizacji zależności ani `npm audit fix`; zielony build nie jest certyfikatem braku podatności.
- Liczniki ochronne nie są backupem ani dowodem zachowania każdego rekordu. Przed wdrożeniem trzeba nadal mieć odtwarzalny backup i wykonać smoke historycznych sesji. Sesje analityczne z `events` i nagrania Replay z 30-dniowym TTL trzeba sprawdzać oddzielnie; brak nagrania starszego niż retencja nie oznacza automatycznie utraty historii analitycznej.

### Stan przekazania i dalsze kroki

Wynik jest przekazywany do checkoutu `C:\PROJECTS\rybbit-wotcv` na `feat/wotcv` jako rozwiązany i staged merge, **bez commita i pushu**, zgodnie z wcześniejszym ustaleniem użytkownika. HEAD pozostaje `7622e452`, a `MERGE_HEAD` wskazuje `31009572`; dopiero zatwierdzony merge commit połączy obie historie. Backup wskazuje nietknięty stan sprzed integracji. `master` nie jest przepisywany.

Raport walidacji dotyczy dokładnego drzewa przygotowanego w worktree, którego identyczność z indeksem głównego checkoutu jest sprawdzana przed przekazaniem. Istniejące lokalne `node_modules` głównego checkoutu nie są automatycznie podmieniane; czyste instalacje i buildy wykonano w worktree integracyjnym.

Po zatwierdzeniu commita i świadomej publikacji należy przejść powyższy plan wdrożenia. **Samo `git pull` nie wystarcza do aktualizacji uruchomionej aplikacji.** Zwykły deploy z aktualnym skryptem sam obsługuje PostgreSQL i inicjalizację ClickHouse; nie ma dodatkowego ręcznego backfillu ani przełączenia Replay v2. Stan produkcyjnych migracji należy potwierdzić na miejscu, zamiast zakładać go na podstawie logów z sierpnia.
