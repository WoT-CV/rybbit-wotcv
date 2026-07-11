# WoT-CV Rybbit — szczegółowy plan sprzątania forka

## 1. Cel dokumentu

Ten dokument opisuje plan uporządkowania zmian wykonanych na gałęzi `feat/wotcv` bez usuwania działających funkcji WoT-CV i bez nadpisywania zmian pobranych z głównego projektu Rybbit.

Plan obejmuje:

- wszystkie commity autora `Daniel Owczarczyk <nordansolutionsit@gmail.com>` znajdujące się w `master..feat/wotcv`,
- aktualny końcowy diff forka względem `master`,
- kod klienta, serwera, trackera, pakietu `shared`, konfigurację Docker i skrypty operacyjne,
- dokumentację utworzoną podczas implementacji,
- przygotowanie forka do regularnego synchronizowania z upstreamem,
- wprowadzenie testów regresyjnych dla funkcji, które są już używane na serwerze.

Plan nie zakłada przepisywania historii Git ani squashowania wdrożonych commitów. Sprzątanie powinno powstać jako seria nowych, małych i odwracalnych commitów.

## 2. Stan bazowy audytu

Audyt wykonano dla następującego stanu:

| Element | Wartość |
| --- | --- |
| Gałąź | `feat/wotcv` |
| HEAD | `90499f0625f6a7dcc5a82073f1fd4eb0ae4ef10d` |
| Baza `master` | `70104a766c1966f682e7f12be49caa9ccc266b8b` |
| Liczba commitów Daniela | 69 |
| Liczba zmienionych plików | 258 |
| Cały diff | 18 572 dodanych i 2 363 usuniętych linii |
| Kod z pominięciem katalogów generowanych | około 10 887 dodanych i 1 782 usuniętych linii |
| Zmienione lub dodane testy funkcji WoT-CV | 0 |
| Dokumenty `docs/WOTCV_*.md` | 8 |
| Skrypty `scripts/wotcv-*.sh` | 7 |

Największe obszary diffu:

| Obszar | Pliki |
| --- | ---: |
| `client` | 184 |
| `server` | 48 |
| `docs` | 8 |
| `scripts` | 8, razem z `update_rybbit_wotcv.sh` |
| `shared` | 3 |

Rozkład commitów według głównego celu:

| Obszar | Liczba commitów |
| --- | ---: |
| Replay, Network Replay i eksport | 39 |
| Wdrożenie, Docker, skrypty i metadane buildu | 10 |
| Tłumaczenia i ich audyt | 8 |
| Tożsamość, awatary i globus | 4 |
| Growth Accounting i pulpity | 3 |
| Funkcje self-hosted | 2 |
| Merge z `master` | 1 |
| Pozostałe | 2 |

### 2.1. Wyniki baseline przed sprzątaniem

| Walidacja | Wynik początkowy |
| --- | --- |
| `client: npx tsc --noEmit` | przechodzi |
| `client: npm run lint` | nie przechodzi; ESLint skanuje wygenerowany katalog `.next` i zgłasza 30 problemów |
| `server: npm run db:check` | przechodzi |
| `server: npm run test:run` | nie przechodzi; 3 asercje config trackera nie uwzględniają `networkReplay`, a 9 testów auth używa schematu testowego bez `network_replay_config` |

Te błędy stanowią baseline forka i powinny zostać usunięte podczas etapów konfiguracji, jakości i testów. Nie są traktowane jako nowe regresje powstałe podczas sprzątania.

## 3. Zakres przejrzanych commitów

### 3.1. Network Replay i pierwszy rollout

- `9510c4e1` — konfiguracja Network Replay i tłumaczenia.
- `ad0369fc` — przechwytywanie body i nagłówków request/response.
- `da818048` — korekta opisów Session Replay.
- `7b3ffd24` — obsługa błędów transportu i plugin sieciowy.
- `f5571421` — filtrowanie i wyświetlanie requestów.
- `bf9f05e4` — inspector i waterfall.
- `ca8232ff` — wdrożenie forka.
- `fff4a6d8` — poprawki zgodności przeglądarek.
- `ce885c5e` — obsługa języka polskiego.
- `0e930ef4` — rozszerzenie komponentów Network Replay.
- `3d2f4083` — nazwa projektu Compose i port Postgresa.
- `159fec70` — weryfikacja SHA i tagu obrazu w healthchecku.
- `0d5284ef` — uzupełnienie instrukcji wdrożenia.
- `20dd9d61` — filtr hosta i marker czasu.
- `f28cec14` — uporządkowanie etykiet Network Replay.
- `b182d123` — skrypt pull/build/restart.

### 3.2. Tożsamość, globus i funkcje self-hosted

- `1ff8d398` — awatary użytkowników.
- `57964b2e` — identyfikacja użytkownika na globusie.
- `68c9c07e` — dane użytkownika dla lokalizacji sesji.
- `88b070b4` — menu rozszerzonej analityki self-hosted.
- `2e349845` — weryfikacja funkcji analitycznych self-hosted.
- `b48ac6ab` — wrapper aktualizacji instalacji WoT-CV.
- `b18d2828` — wydzielenie narzędzi awatara.
- `93e56d43` — bezpieczne wykrywanie skryptu wdrożeniowego.
- `53962327` — przekazanie `NEXT_PUBLIC_DEPLOYMENT` do buildów.

### 3.3. Usprawnienia Network Replay i aktywności

- `dc2c58ba` — correlation ID i obliczanie rozmiaru transferu.
- `9b0d4719` — obliczanie offsetów aktywności.
- `d07f05b5` — padding okresów aktywności.

### 3.4. Tłumaczenie na język polski

- `b18c7f57` — pierwszy audyt pokrycia języka polskiego.
- `048446c9` — tłumaczenia analityki botów.
- `d4241674` — tłumaczenia wspólnych ekranów analitycznych.
- `2ff37444` — tłumaczenia logowania i ustawień.
- `1b2e15f9` — tłumaczenia panelu administracyjnego i uptime.
- `02d43884` — tłumaczenia pozostałych ekranów.
- `884a3f6e` — końcowa bramka jakości tłumaczeń.

### 3.5. Growth Accounting i pierwsza wersja pomijania bezczynności

- `7467d679` — domyślnie aktywne pomijanie bezczynności.
- `d2971270` — pełne przejścia przez okresy bezczynności.
- `24defb17` — API Growth Accounting.
- `bdc98c84` — wykres Growth Accounting.
- `8b6a6aa8` — walidacja replay i Growth Accounting.
- `1f335160` — preset karty Growth Accounting w pulpitach.

### 3.6. Odtwarzanie zgodne funkcjonalnie z PostHog

- `f03f162e` — przechwytywanie aktywności.
- `2b0deefb` — deterministyczne porządkowanie eventów.
- `16f5310c` — segmentacja aktywności.
- `761f2213` — odtwarzanie z pomijaniem bezczynności.
- `b76a9b42` — overlay bezczynności.
- `b335f371` — oś czasu aktywności.
- `615f6806` — zabezpieczenia seek i playback.
- `75408b54` — zgodność ze starszymi nagraniami.
- `98a25b38` — optymalizacja przetwarzania aktywności.
- `3625aa4b` — walidacja odtwarzania.
- `8d2ee005` — szybsze pomijanie i odblokowanie kontrolek.

### 3.7. Eksport replay

- `8c096216` — API, UI, kolejka i renderer eksportu.
- `5cbae1bd` — usunięcie `clanLogoUrl` z cech użytkownika.
- `71eeaf56` — fallback konstruktora rrweb w rendererze.
- `38f4783e` — usunięcie nieużywanego `captureMs` i części UI.
- `ff2a9330` — paczka diagnostyczna do zgłoszeń GitHub.
- `ded1249b` — limit eksportu do 30 sekund.
- `b8fecf8b` — minimalny zakres eksportu.
- `54bb7e5b` — wycofanie minimalnego zakresu.
- `bcc18ad2` — uproszczenie opcji eksportu.
- `c2322ca6` — wybór zakresu na osi czasu.
- `f96fed61` — układ kontrolek i slidera.
- `56ac58b0` — zwiększenie limitu eksportu do 2 minut.

### 3.8. Synchronizacja, korekty i zgodność licencyjna

- `a0b6c201` — merge `master` do `feat/wotcv`.
- `8ef671d4` — domyślny minimalny czas sesji 5 sekund.
- `9b855e8a` — domyślny dzienny Growth Accounting i poprawki replay.
- `b0648f3a` — objaśnienia serii Growth Accounting.
- `90499f06` — odnośniki do źródeł i informacje o zmodyfikowanym forku AGPL-3.0.

W historii nie znaleziono dwóch commitów o identycznym patch-id. Powtarzające się tematy wynikają z kolejnych iteracji tej samej funkcji, a nie z dosłownego zdublowania patcha.

## 4. Najważniejsze wyniki audytu

### 4.1. Replay ma największy koszt utrzymania

Najczęściej zmieniane pliki kodu to:

- `client/src/components/replay/replayStore.ts` — 13 commitów,
- `client/src/components/replay/player/ReplayPlayerControls.tsx` — 12 commitów,
- `client/src/components/replay/player/utils/replayUtils.ts` — 12 commitów,
- historyczny `ReplayExportDialog.tsx` — 8 commitów przed zastąpieniem go obecną wersją,
- `server/src/services/replay/export/replayExportRenderer.ts` — 5 commitów.

Wnioski:

- store łączy wybór sesji, instancję rrweb, stan odtwarzania, segmentację, autoplay, pomijanie i eksport,
- typ instancji odtwarzacza jest zapisany jako `any`,
- autoplay korzysta z pięciu opóźnionych prób: `0`, `100`, `300`, `750`, `1500` ms,
- algorytm aktywności klienta i algorytm aktywności renderera eksportu są niezależne,
- backend eksportu nadal przyjmuje `skipInactivity` i `playbackSpeed`, chociaż UI wymusza stałe wartości,
- limit 2 minut występuje osobno w kliencie i walidacji API,
- host `api.wot-cv.com` jest zaszyty bezpośrednio w rendererze eksportu,
- część komunikatów błędów replay nadal jest zapisana po angielsku bez i18n.

### 4.2. Kontrakty Network Replay są rozproszone

Obecnie istnieją co najmniej trzy poziomy definicji:

- `shared/src/networkReplay.ts` zawiera wyłącznie konfigurację,
- tracker ma własne typy requestów, body, timingów i rezultatów,
- klient ma ponownie zdefiniowane typy requestów w `client/src/components/replay/network/types.ts`.

Domyślna konfiguracja jest powtórzona w:

- `server/src/db/postgres/schema.ts`,
- `server/src/lib/networkReplayConfig.ts`,
- konfiguracji trackera.

To tworzy ryzyko, że zapis w bazie, publiczny endpoint konfiguracji i recorder będą używać innych wartości domyślnych.

### 4.3. Brak testów nowych funkcji

W diffie forka nie dodano testów dla:

- przechwytywania `fetch` i XHR,
- limitów i maskowania body,
- kończenia requestów podczas unload,
- parsera eventów Network Replay,
- segmentacji aktywności i pomijania bezczynności,
- autoplay i seek,
- eksportu, kolejki i uprawnień do pobrania,
- Growth Accounting,
- konfiguracji Network Replay,
- rozpoznawania użytkownika i awatara.

Istniejący test `server/src/api/sessionReplay/recordSessionReplay.test.ts` nie pokrywa tych rozszerzeń.

### 4.4. Tłumaczenia generują duży churn

Pliki locale były zmieniane od 21 do 26 razy. Aktualny skrypt `audit:polish` raportuje 786 potencjalnych pozycji, ale:

- raport zawiera polskie teksty jako wyniki,
- raport zawiera fragmenty składni JSX,
- raport miesza nazwy planów, standardów i produktów z tekstami wymagającymi tłumaczenia,
- polecenie kończy się kodem `0`, więc nie działa jako bramka jakości.

Skrypt jest przydatnym prototypem wyszukiwarki, ale przed włączeniem do CI wymaga poprawy parsera, wyjątków i kodu wyjścia.

### 4.5. Funkcje self-hosted są sterowane zbyt ogólnym warunkiem

`SHOW_EXTENDED_WEB_ANALYTICS = IS_CLOUD || DEPLOYMENT === "self-hosted"` odblokowuje grupę ekranów jedną flagą. Taki warunek:

- nie opisuje rzeczywistej zdolności backendu,
- utrudnia późniejsze dodanie funkcji dostępnej tylko dla części instalacji,
- zwiększa ryzyko konfliktów przy zmianach upstreamu w `IS_CLOUD`, subskrypcjach i sidebarze.

Docelowo menu powinno opierać się na nazwanych możliwościach, a nie na typie instalacji.

### 4.6. Skrypty wdrożeniowe częściowo się pokrywają

Aktualnie utrzymywane są:

- build lokalny z brancha,
- deployment gotowych obrazów GHCR,
- pull/build/restart będący wrapperem pierwszego skryptu,
- zewnętrzny wrapper aktualizacji,
- audyt serwera,
- dwa smoke testy,
- synchronizacja upstreamu.

Powtarzają się między innymi:

- nazwy obrazów,
- zestawy plików Compose,
- healthcheck,
- odczyt i zapis stanu wdrożenia,
- logika rollbacku,
- domyślna gałąź `feat/wotcv`.

Nie należy scalać trybu lokalnego buildu i wdrożenia obrazów w jeden skrypt z wieloma nieczytelnymi przełącznikami. Należy natomiast wydzielić wspólne stałe i funkcje oraz usunąć wrappery, które nie dodają zachowania.

### 4.7. Narzędzia statyczne wymagają konfiguracji

`knip` wskazuje kandydatów powiązanych ze zmianami WoT-CV, między innymi:

- `isSafeAvatarUrl`,
- starsze funkcje aktywności w `replayUtils.ts`,
- `useCancelReplayExport`,
- część eksportowanych typów replay i Growth Accounting,
- `DEFAULT_NETWORK_REPLAY_CONFIG`.

Jednocześnie raport zawiera wiele fałszywych trafień dla entrypointów, generowanych bundli i plików uruchamianych przez skrypty. Najpierw trzeba dodać konfigurację `knip`, a dopiero potem usuwać wskazany kod.

### 4.8. W diffie są drobne problemy formatowania

`git diff --check master..feat/wotcv` wykrywa:

- dodatkową pustą linię na końcu `client/src/lib/utils.ts`,
- trailing whitespace w dwóch historycznych dokumentach.

Problemy dokumentów znikną po ich konsolidacji. Kod należy poprawić w osobnym, małym commicie formatowania, aby nie mieszać go z refaktorem zachowania.

### 4.9. Artefakty generowane mają duży udział w diffie

Największe automatycznie generowane zmiany to:

- `server/public/script-full.js`,
- `server/public/script.js`,
- `server/drizzle/meta/0010_snapshot.json`,
- katalog `client/messages`,
- lockfile serwera.

Nie wolno usuwać ich automatycznie tylko dlatego, że są generowane. Najpierw trzeba potwierdzić model repozytorium upstream i dodać deterministyczną walidację, która wykryje rozjazd źródła i artefaktu.

## 5. Docelowe zasady architektoniczne

Po sprzątaniu fork powinien spełniać następujące zasady:

1. Każdy kontrakt danych ma jednego właściciela.
2. Klient, API i worker eksportu korzystają z tych samych stałych limitów.
3. Segmentacja aktywności jest czystym, testowalnym algorytmem.
4. Integracja rrweb jest zamknięta za małym, typowanym adapterem.
5. Zustand przechowuje wyłącznie stan potrzebny wielu niezależnym komponentom.
6. Recorder Network Replay ma jawny cykl życia i jeden mechanizm finalizacji requestu.
7. Kod renderera eksportu nie kopiuje logiki UI replay.
8. Możliwości self-hosted są nazwanymi capability flags.
9. Tłumaczenia są generowane deterministycznie, a polska jakość jest mierzona bez fałszywych trafień.
10. Skrypty operacyjne mają jednoznaczne role i wspólną konfigurację.
11. Dokumentacja opisuje stan końcowy, nie historię rozmów i kolejnych iteracji.
12. Informacje wymagane przez AGPL-3.0 pozostają widoczne i testowane.

## 6. Docelowa dokumentacja forka

### 6.1. Dokumenty, które należy zachować

| Plik | Decyzja | Uzasadnienie |
| --- | --- | --- |
| `LICENSE.md` | zachować bez zmian treści licencji | Podstawa licencyjna projektu. |
| `NOTICE.md` | zachować i aktualizować | Informacja o upstreamie i zmodyfikowanym forku. |
| `README.md` | zachować, skrócić sekcję forka | Główny punkt wejścia i odnośnik do źródeł. |
| `docs/WOTCV_FORK_DEPLOYMENT.md` | zachować po uproszczeniu | Operacyjny runbook serwera. |
| `docs/WOTCV_FORK_DIFFERENCES.md` | utworzyć | Docelowe źródło prawdy o różnicach forka. |
| `docs/WOTCV_CODE_CLEANUP_PLAN.md` | zachować tylko do końca sprzątania | Lista etapów roboczych; po zakończeniu usunąć albo zastąpić krótkim raportem. |

### 6.2. Dokumenty do scalenia i usunięcia

| Obecny plik | Materiał do przeniesienia | Decyzja końcowa |
| --- | --- | --- |
| `WOTCV_NETWORK_REPLAY_IMPLEMENTATION_PLAN.md` | format eventu, decyzje o storage, limity i prywatność, ważne merge hotspots | przenieść aktualny stan do `WOTCV_FORK_DIFFERENCES.md`, następnie usunąć |
| `WOTCV_NETWORK_REPLAY_COMPLETION_AUDIT.md` | niezrealizowane ryzyka i ręczne walidacje | przenieść tylko nadal aktualne punkty, następnie usunąć |
| `WOTCV_NETWORK_REPLAY_ROLLOUT.md` | aktywacja per site, smoke check i obserwacja storage | przenieść do deployment runbooka, następnie usunąć |
| `WOTCV_POLISH_TRANSLATION_QA.md` | polecenie audytu i zasady tłumaczeń | przenieść do `WOTCV_FORK_DIFFERENCES.md` lub `client/AGENTS.md`, następnie usunąć |
| `WOTCV_REPLAY_AND_GROWTH_ACCOUNTING_PLAN.md` | definicje new/returning/resurrected/dormant oraz zasady inactivity | przenieść jako dokumentację zachowania, następnie usunąć |
| `WOTCV_REPLAY_AND_GROWTH_ACCOUNTING_VALIDATION.md` | scenariusze smoke i kryteria danych rzeczywistych | przenieść do test planu/runbooka, następnie usunąć |
| `WOTCV_REPLAY_UI_ENHANCEMENTS_PLAN.md` | opis filtrów hosta, markera czasu i UX pomijania | przenieść do opisu funkcji replay, następnie usunąć |

Usunięcie dokumentu może nastąpić dopiero w tym samym commicie, w którym jego nadal aktualna wiedza trafia do dokumentu docelowego.

### 6.3. Zakres `WOTCV_FORK_DIFFERENCES.md`

Nowy dokument powinien zawierać:

1. bazę upstream i strategię gałęzi,
2. tabelę funkcji dodanych przez WoT-CV,
3. schemat architektury Network Replay,
4. rozszerzenia konfiguracji strony i bazy danych,
5. zasady nagrywania i prywatności danych sieciowych,
6. różnice w odtwarzaczu replay,
7. eksport replay i ograniczenia bezpieczeństwa,
8. Growth Accounting i definicje czterech stanów,
9. identyfikację użytkownika, awatary i globus,
10. funkcje odblokowane dla self-hosted,
11. obsługę języka polskiego,
12. różnice w buildzie, obrazach i healthchecku,
13. obowiązki AGPL-3.0 i endpoint źródła,
14. listę plików o wysokim ryzyku konfliktu z upstreamem,
15. checklistę po każdym merge z `master`.

## 7. Plan wykonawczy

## Etap 0 — zamrożenie zachowania i baseline

### Cel

Zabezpieczyć aktualnie działającą wersję przed refaktorem i uzyskać porównywalny zestaw wyników.

### Zadania

1. Zapisać SHA aktualnego wdrożenia, odpowiedzi `/api/health` i `/api/source`.
2. Zapisać rozmiary `script.js` i `script-full.js`.
3. Zebrać przykładowe sesje:
   - nowy format aktywności,
   - starszy format nagrania,
   - sesja z fetch i XHR,
   - sesja bez requestów sieciowych,
   - sesja z długą bezczynnością,
   - sesja krótsza niż 5 sekund.
4. Zapisać przykładowy eksport i jego metadane.
5. Uruchomić i zapisać wyniki:
   - `client: npm run lint`,
   - `client: npx tsc --noEmit`,
   - `client: npm run build`,
   - `server: npm run build`,
   - `server: npm run test:run`,
   - `server: npm run db:check`,
   - `docker compose ... config`.
6. Nie naprawiać w tym etapie błędów upstream niezwiązanych z forkiem; tylko je opisać.

### Kryteria akceptacji

- baseline ma SHA i datę,
- istnieje lista znanych ostrzeżeń,
- próbki nie zawierają sekretów i danych, których nie wolno przechowywać w repo,
- wiadomo, które walidacje przechodzą przed refaktorem.

### Proponowany commit

`docs(cleanup): record WoT-CV fork baseline`

## Etap 1 — konsolidacja dokumentacji

### Cel

Zastąpić dokumenty etapowe dokumentacją opisującą stan końcowy.

### Zadania

1. Utworzyć `docs/WOTCV_FORK_DIFFERENCES.md` według sekcji 6.3.
2. Skrócić `README.md` do krótkiej informacji o forku, źródłach i dokumentacji różnic.
3. Przenieść operacyjne fragmenty rolloutów do `WOTCV_FORK_DEPLOYMENT.md`.
4. Usunąć siedem dokumentów wskazanych w sekcji 6.2.
5. Naprawić wszystkie odnośniki do usuwanych plików.
6. Zachować `NOTICE.md` i informacje AGPL-3.0.

### Kryteria akceptacji

- repo zawiera jeden dokument różnic i jeden runbook wdrożenia,
- wyszukiwanie `rg "WOTCV_NETWORK_REPLAY_|WOTCV_REPLAY_"` nie zwraca martwych linków,
- instrukcje nie opisują nieistniejących ekranów ani starych wariantów eksportu.

### Proponowany commit

`docs(cleanup): consolidate WoT-CV fork documentation`

## Etap 2 — wspólna konfiguracja i stałe forka

### Cel

Usunąć magiczne wartości i rozjazdy między klientem, serwerem, Dockerem i skryptami.

### Zadania

1. W `shared` zdefiniować wspólne stałe domenowe:
   - maksymalny czas eksportu,
   - domyślna konfiguracja Network Replay,
   - wersja schematu eventu sieciowego.
2. Nie umieszczać w paczce współdzielonej sekretów, adresów środowiskowych ani ustawień serwera.
3. Przenieść adres repozytorium źródłowego do jednej jawnej konfiguracji buildowej z bezpiecznym fallbackiem.
4. W skryptach wydzielić wspólny plik z nazwami obrazów, zestawami Compose i healthcheckiem.
5. Usunąć duplikat `defaultNetworkReplayConfig` ze schematu lub z biblioteki serwera.
6. Usunąć osobne wartości `2 * 60_000` w kliencie i API.
7. Nazwać i udokumentować host eksportu logów sieciowych zamiast trzymać surowy string w rendererze.

### Kryteria akceptacji

- zmiana limitu wymaga edycji jednego miejsca,
- domyślna konfiguracja bazy i endpointu trackera jest identyczna,
- build klienta nie importuje kodu przeznaczonego wyłącznie dla Node.js,
- bundle trackera nie rośnie przez przypadkowe importy runtime z `shared`.

### Proponowany commit

`refactor(wotcv): centralize fork configuration and limits`

## Etap 3 — kanoniczne kontrakty Network Replay

### Cel

Zapewnić jeden model eventu od recordera do UI.

### Zadania

1. Przenieść do `shared/src/networkReplay.ts` typy:
   - `NetworkOutcome`,
   - `CapturedBody`,
   - `CapturedNetworkTiming`,
   - `CapturedNetworkSizes`,
   - `CapturedNetworkError`,
   - `CapturedNetworkRequest`.
2. Pozostawić `ParsedNetworkRequest` jako typ klienta, ponieważ zawiera obliczone offsety UI.
3. Dodać jawny discriminant wersji schematu.
4. Usunąć lokalne kopie typów z trackera i klienta.
5. Zastąpić `any` i luźne `unknown` przy granicach parserem z kontrolowanym fallbackiem.
6. Zdefiniować zachowanie dla eventu o nowszej, nieznanej wersji.
7. Dodać fixture eventu używany przez testy serwera i klienta.

### Kryteria akceptacji

- recorder i UI kompilują się z jednym kontraktem,
- parser odrzuca uszkodzony event bez wywrócenia całej powtórki,
- starsze nagrania bez Network Replay nadal się odtwarzają.

### Proponowany commit

`refactor(replay): unify network replay contracts`

## Etap 4 — konfiguracja strony i schema bazy

### Cel

Uprościć walidację i aktualizację `networkReplayConfig` bez zmiany formatu danych.

### Zadania

1. Wydzielić schema Zod Network Replay z `updateSiteConfig.ts`.
2. Zastąpić `dbUpdateData: any` typowanym obiektem aktualizacji Drizzle.
3. Wydzielić czystą funkcję wyliczającą następny stan:
   - Session Replay wyłączone wyłącza Network Replay,
   - aplikacja mobilna wyłącza funkcje webowe,
   - body limit nie przekracza event limit,
   - event limit nie przekracza batch limit.
4. Ujednolicić komunikaty błędów API.
5. Sprawdzić cache `siteConfig.updateConfig` po częściowej aktualizacji JSONB.
6. Zachować wygenerowaną migrację `0010`, ale zweryfikować ją przez `npm run db:check`.
7. Nie uruchamiać skryptów migracyjnych podczas sprzątania.

### Kryteria akceptacji

- wszystkie kombinacje zależności mają test tabelaryczny,
- update niezwiązanej opcji strony nie zmienia konfiguracji Network Replay,
- konfiguracja istniejącej strony bez kolumny nie jest obsługiwana przez ukryty runtime workaround; wymagana schema jest jawnie opisana.

### Proponowany commit

`refactor(sites): isolate network replay configuration rules`

## Etap 5 — lifecycle recordera Network Replay

### Cel

Uprościć recorder bez utraty danych i bez podwójnego patchowania globalnych API.

### Zadania

1. Zdefiniować jeden interfejs finalizacji requestu dla fetch i XHR.
2. Rozdzielić odpowiedzialności:
   - obserwacja requestu,
   - przechwytywanie body,
   - nagłówki,
   - dopasowanie Performance Entry,
   - finalizacja pending requestów,
   - emitowanie eventu rrweb.
3. Usunąć duplikację pomiędzy `fetchObserver.ts` i `xhrObserver.ts`.
4. Zapewnić idempotentne `start()` i `stop()`.
5. Przy `stop()` przywrócić oryginalne `fetch` i XHR dokładnie raz.
6. Ustalić kolejność finalizacji przy `pagehide`, `visibilitychange` i `beforeunload`.
7. Zabezpieczyć body capture przed:
   - strumieniem zużytym przez aplikację,
   - niekończącym się odczytem,
   - payloadem przekraczającym limity,
   - typem binarnym,
   - błędem clone.
8. Przejrzeć listę requestów trackera, które nie mogą nagrywać samych siebie.
9. Zastąpić ostrzeżenia konsolowe małym, opcjonalnym loggerem debug.

### Testy

- fetch success, HTTP error, network error, abort i timeout,
- XHR success, error, abort i timeout,
- request/response JSON, text, FormData, Blob, ArrayBuffer i stream,
- request pending przy unload,
- dwa starty i dwa stopy recordera,
- event większy niż limit,
- wykluczenie endpointów trackera.

### Proponowany commit

`refactor(tracker): simplify network replay recorder lifecycle`

## Etap 6 — transport Session Replay i batching

### Cel

Zapewnić przewidywalne wysyłanie dużych eventów sieciowych.

### Zadania

1. Wydzielić obliczanie rozmiaru serializowanego batcha jako czystą funkcję.
2. Zdefiniować zachowanie dla pojedynczego eventu większego niż batch.
3. Rozdzielić kolejkę bieżącą, kolejkę retry i eventy odrzucone.
4. Ograniczyć liczbę retry oraz pamięć zajmowaną w karcie.
5. Preferować `sendBeacon` tylko dla payloadów spełniających jego limity.
6. Nie wykonywać synchronicznej serializacji całej historii podczas unload.
7. Dodać licznik odrzuconych eventów dostępny w trybie debug.
8. Potwierdzić zgodność backendowego limitu body z maksymalnym batchem trackera.

### Kryteria akceptacji

- duży request nie blokuje wysłania mniejszych eventów,
- retry nie zmienia kolejności eventów,
- tracker nie przekracza ustalonego limitu pamięci,
- brak nieskończonej pętli przy stale odrzucanym batchu.

### Proponowany commit

`refactor(replay): harden replay batching and retry`

## Etap 7 — parser i model widoku Network Replay

### Cel

Oddzielić parsowanie danych od filtrowania i renderowania.

### Zadania

1. Zbudować pipeline:
   - walidacja eventu,
   - normalizacja requestu,
   - obliczenie offsetów,
   - korelacja Performance Entry,
   - przygotowanie indeksów filtrów.
2. Nie parsować ponownie body i URL przy każdej zmianie filtra.
3. Ujednolicić obliczanie transfer size i jawnie oznaczać wartość szacowaną.
4. Wydzielić rozpoznawanie correlation ID do funkcji obsługującej wielkość liter nagłówków.
5. Ustalić zachowanie dla niepoprawnego URL.
6. Ograniczyć renderowanie dużych list przez wirtualizację lub paginację widoku.
7. Zapisać filtry host/method/status w lokalnym stanie panelu, nie w globalnym replay store.
8. Dodać testy sortowania eventów o identycznym timestampie.

### Kryteria akceptacji

- sesja z 1000 requestów zachowuje płynne filtrowanie,
- correlation ID jest widoczne bez przechodzenia do nagłówków,
- transfer size ma wyjaśnione źródło albo stan „brak danych”,
- uszkodzony request nie ukrywa pozostałych requestów.

### Proponowany commit

`refactor(replay): separate network parsing from presentation`

## Etap 8 — typowany adapter rrweb

### Cel

Usunąć `any` i bezpośrednie zależności komponentów od nieudokumentowanych szczegółów rrweb-player.

### Zadania

1. Utworzyć `ReplayPlayerAdapter` z metodami:
   - `play`,
   - `pause`,
   - `seek`,
   - `setSpeed`,
   - `resize`,
   - `getDuration`,
   - `getPlayingState`,
   - `destroy`,
   - typowane subskrypcje eventów.
2. Zamknąć różnice `goto`, `pause(offset)` i eventów UI w adapterze.
3. Używać tego samego modelu eventów rrweb w kliencie i rendererze eksportu.
4. Usunąć ręczne `innerHTML = ""` z warstwy biznesowej; cleanup ma należeć do adaptera.
5. Dodać ochronę przed eventami przychodzącymi po zniszczeniu instancji.

### Kryteria akceptacji

- store nie zawiera `player: any`,
- hooki nie wywołują nieznanych metod rrweb bez adaptera,
- wymiana wersji rrweb wymaga zmiany głównie adaptera.

### Proponowany commit

`refactor(replay): introduce typed rrweb player adapter`

## Etap 9 — podział replay store i deterministyczny autoplay

### Cel

Zmniejszyć liczbę zależnych stanów i usunąć magiczne retry autoplay.

### Zadania

1. Rozdzielić stan na:
   - wybór sesji,
   - lifecycle instancji,
   - playback,
   - analizę aktywności,
   - zakres eksportu.
2. Zdecydować, które wartości są stanem pochodnym i nie powinny być zapisywane:
   - `isSkippingInactivity`,
   - `effectivePlaybackSpeed`,
   - część `playbackState`.
3. Zastąpić `autoplaySessionId` jednoznacznym żądaniem odtworzenia z numerem generacji.
4. Uruchamiać autoplay po sygnale „player ready”, a nie przez pięć timeoutów.
5. Zdefiniować zachowanie po kliknięciu:
   - nowej sesji,
   - tej samej sesji,
   - eventu na osi czasu,
   - requestu sieciowego,
   - końca odtwarzania.
6. Zachować stan „odtwarzało się / było zatrzymane” przy seek.
7. Nie persistować `minDuration`, jeśli produkt wymaga stałego minimum 5 sekund; usunąć niepotrzebny setter albo jawnie dodać persistence, jeśli filtr ma pozostać edytowalny.

### Kryteria akceptacji

- kliknięcie sesji uruchamia ją dokładnie raz,
- seek nie zatrzymuje odtwarzania, jeśli wcześniej trwało,
- szybkie przełączanie sesji nie uruchamia starego playera,
- nie istnieją timeouty autoplay zależne od szybkości urządzenia.

### Proponowany commit

`refactor(replay): make session selection and autoplay deterministic`

## Etap 10 — jeden algorytm aktywności i bezczynności

### Cel

Zapewnić identyczne okresy aktywności w UI i eksporcie.

### Zadania

1. Wydzielić czysty moduł segmentacji przyjmujący eventy i profil nagrania.
2. Zdefiniować listę eventów aktywności w jednym miejscu.
3. Zachować wymagane okno:
   - aktywność rozpoczyna się 500 ms przed eventem,
   - aktywność kończy się 1000 ms po ostatnim evencie.
4. Zdefiniować minimalny segment bezczynności kwalifikujący się do pominięcia.
5. Ujednolicić zachowanie przy nakładających się oknach.
6. Ujednolicić zachowanie na początku i końcu nagrania.
7. Przekazywać wynik segmentacji do UI oraz eksportu albo używać dokładnie tej samej biblioteki po obu stronach.
8. Usunąć starsze, nieużywane funkcje `calculateActivityPeriods`, `normalizeActivityPeriods` i `findNextActivityPeriod`, jeśli po konfiguracji `knip` nadal są martwe.
9. Zachować jawny profil zgodności dla starych nagrań.

### Testy tabelaryczne

- brak eventów aktywności,
- pojedynczy event,
- eventy w odległości mniejszej i większej niż próg,
- aktywność na początku i końcu,
- nakładające się paddingi,
- eventy o tym samym czasie,
- starsze nagranie bez capture version,
- seek do środka segmentu bezczynności.

### Proponowany commit

`refactor(replay): unify activity segmentation and inactivity skipping`

## Etap 11 — uproszczenie UI osi czasu

### Cel

Rozdzielić prezentację aktywności, requestów i zakresu eksportu od suwaka odtwarzania.

### Zadania

1. Zdefiniować jeden model współrzędnych czasu dla wszystkich warstw.
2. Wydzielić warstwy:
   - activity markers,
   - network markers,
   - current time,
   - export selection.
3. Zredukować `activity-slider.tsx` do komponentu prezentacyjnego.
4. Przenieść obliczenia procentów i clampowanie zakresu do czystych helperów.
5. Zapewnić obsługę klawiatury dla wyboru zakresu.
6. Zapewnić widoczny focus i opis ARIA uchwytów.
7. Sprawdzić układ drawer, desktop, laptop i mały viewport.

### Kryteria akceptacji

- oba timeliny wykorzystują pełną dostępną szerokość,
- panel akcji nie zmienia szerokości skali czasu,
- zakres do 2 minut przesuwa się jako okno bez blokowania uchwytu,
- kliknięcie markera zachowuje stan odtwarzania.

### Proponowany commit

`refactor(replay): simplify timeline layers and export selection`

## Etap 12 — uproszczenie kontraktu i workera eksportu

### Cel

Usunąć wycofane opcje i ograniczyć odpowiedzialność renderera.

### Zadania

1. Usunąć z publicznego requestu eksportu:
   - `skipInactivity`,
   - `playbackSpeed`.
2. W serwerze ustalić stałe zachowanie: pomijanie bezczynności zawsze aktywne, prędkość aktywności 1x.
3. Używać wspólnego limitu 2 minut.
4. Wydzielić z 520-liniowego renderera:
   - przygotowanie strony rrweb,
   - odtwarzanie okien aktywności,
   - przechwycenie wideo,
   - parsowanie logów sieciowych,
   - generowanie metadanych,
   - pakowanie ZIP.
5. Usunąć drugi algorytm `isActiveEvent` po wdrożeniu etapu 10.
6. Wydzielić format plików eksportu jako wersjonowany manifest.
7. Walidować, że eksport zawiera wyłącznie requesty do dozwolonego hosta.
8. Przejrzeć redakcję nagłówków i body przed zapisaniem do paczki.
9. Sprawdzić lifecycle BullMQ w trybie klastra, aby worker nie był inicjalizowany przypadkowo w niewłaściwych procesach.
10. Ograniczyć liczbę jednoczesnych instancji Chromium i dodać timeout renderowania.
11. Usuwać pliki tymczasowe również po błędzie, anulowaniu i restarcie procesu.

### Testy

- autoryzacja właściciela eksportu,
- limit zakresu,
- limit równoległych zadań,
- anulowanie queued i rendering,
- wygaśnięcie pliku,
- cleanup po wyjątku Chromium,
- paczka zawiera tylko replay, metadane i dozwolone logi sieciowe,
- zgodność segmentów filmu z segmentami UI.

### Proponowany commit

`refactor(replay): simplify export contract and renderer pipeline`

## Etap 13 — Growth Accounting

### Cel

Ustabilizować definicje analityczne i usunąć duplikację wykresu między Retention i Dashboard.

### Zadania

1. Przenieść typ odpowiedzi do współdzielonego kontraktu analityki.
2. Rozdzielić query building od mapowania wyników.
3. Dodać testy definicji:
   - new,
   - returning,
   - resurrected,
   - dormant.
4. Sprawdzić granice okresów w strefie użytkownika i UTC.
5. Sprawdzić pierwszy okres bez historii oraz ostatni niepełny okres.
6. Ustalić, czy dormant ma być wartością ujemną wyłącznie na wykresie, czy już w API.
7. Wydzielić wspólny komponent wykresu używany przez Retention i kartę dashboardu.
8. Zastąpić duże lokalne obiekty presetów fabrykami lub danymi, bez duplikacji opisów.
9. Zachować domyślny bucket `day` na stronie Retention.
10. Dodać tooltipy definicji jako część legendy dostępnej klawiaturą.

### Kryteria akceptacji

- suma kategorii jest matematycznie wyjaśniona dla każdego okresu,
- wyniki day/week są deterministyczne dla strefy `Europe/Warsaw`,
- karta dashboardu i Retention pokazują te same dane,
- tooltip nie wychodzi poza kontener wykresu.

### Proponowany commit

`refactor(analytics): stabilize growth accounting model and chart`

## Etap 14 — tożsamość, awatary i globus

### Cel

Ujednolicić rozpoznawanie użytkownika i bezpieczne renderowanie zewnętrznego logo.

### Zadania

1. Zdefiniować jeden resolver nazwy użytkownika z priorytetami traitów.
2. Używać jednego pola `avatarUrl`; nie przywracać `clanLogoUrl`.
3. Zweryfikować, czy `userId`, `customerId`, `customerName` i `clanTag` są potrzebne w każdym widoku.
4. Usunąć nieużywane eksporty po poprawnej konfiguracji `knip`.
5. Wydzielić walidację URL awatara i fallback obrazka.
6. Nie ładować niebezpiecznych schematów URL.
7. Używać tego samego komponentu w tabeli users, replay, sidebarze użytkownika i globusie, jeśli wymagania rozmiaru na to pozwalają.
8. Sprawdzić, czy endpoint lokalizacji nie wykonuje zapytań per marker.
9. Ustalić fallback dla sesji anonimowej i dla nieistniejącego logo.

### Kryteria akceptacji

- nazwa i logo są identyczne w Users, Replay i Globe,
- błędny URL nie psuje listy ani mapy,
- endpoint globusa nie wprowadza N+1,
- nie ma duplikacji pola logo w traits.

### Proponowany commit

`refactor(identity): unify user labels and avatar handling`

## Etap 15 — capability flags self-hosted

### Cel

Zastąpić ogólną flagę instalacji modelem rzeczywistych możliwości.

### Zadania

1. Utworzyć nazwane capabilities, na przykład:
   - `pagesAnalytics`,
   - `performanceAnalytics`,
   - `botAnalytics`,
   - `customQuery`,
   - `dashboards`,
   - `replayExport`.
2. Zdefiniować ich źródło: build config, publiczny endpoint capabilities albo stały profil self-hosted.
3. Sidebar, routing i ekran ustawień powinny używać tego samego modelu.
4. Backend ma odrzucać wywołanie funkcji niedostępnej, niezależnie od ukrycia menu.
5. Oddzielić capability od planu płatnego i od `IS_CLOUD`.
6. Dodać smoke test dla każdego ekranu odblokowanego przez WoT-CV.

### Kryteria akceptacji

- widoczność menu odpowiada dostępności endpointu,
- brak jednej funkcji nie ukrywa pozostałych,
- merge zmian upstream w `IS_CLOUD` nie usuwa funkcji self-hosted.

### Proponowany commit

`refactor(self-hosted): replace deployment checks with capabilities`

## Etap 16 — architektura tłumaczeń i polska bramka jakości

### Cel

Zmniejszyć churn locale i uzyskać wiarygodny audyt polskich tekstów.

### Zadania

1. Ustalić `en.json` jako katalog źródłowy generowany przez extractor.
2. Nie kopiować polskich tekstów bezpośrednio do plików źródłowych tylko po to, aby audyt przestał je zgłaszać.
3. Przerobić audyt na parser AST albo wykorzystać wynik extractora.
4. Rozdzielić wyniki na:
   - brak klucza w `pl.json`,
   - wartość polska identyczna z angielską,
   - twardo zakodowany user-facing string,
   - dozwolona nazwa własna lub termin techniczny.
5. Dodać allowlistę dla `AGPL-3.0`, nazw planów i produktów.
6. Usunąć fałszywe trafienia składni JSX.
7. Ustawić kod wyjścia `1` tylko dla potwierdzonych naruszeń.
8. Zapewnić stabilną kolejność kluczy, aby extractor nie przepisywał wszystkich locale.
9. Przetłumaczyć pozostałe komunikaty replay i eksportu.
10. Dodać kontrolę, że inne języki nie zostały usunięte ani zastąpione polskim.

### Kryteria akceptacji

- raport nie zawiera polskich tekstów jako braków,
- raport jest wystarczająco precyzyjny, aby działać w CI,
- dodanie nowego angielskiego tekstu bez klucza polskiego powoduje błąd,
- `npm run extract` nie generuje nieuzasadnionego diffu wszystkich locale.

### Proponowany commit

`refactor(i18n): make Polish coverage audit deterministic`

## Etap 17 — konsolidacja skryptów operacyjnych

### Cel

Zachować dwa jawne tryby wdrożenia i usunąć zbędne wrappery.

### Docelowy podział

1. `wotcv-branch-build-deploy.sh` — kanoniczny pull, build lokalny, restart, healthcheck i rollback.
2. `wotcv-deploy.sh` — kanoniczne wdrożenie niezmiennych obrazów GHCR.
3. `wotcv-sync-upstream-master.sh` — synchronizacja `master` z upstreamem.
4. `wotcv-server-audit.sh` — audyt bez modyfikacji serwera.
5. `wotcv-smoke.sh` — jeden skrypt z modułami `analytics`, `growth`, `source` zamiast osobnych smoke wrapperów.

### Zadania

1. Wydzielić wspólne funkcje do `scripts/lib/wotcv-common.sh`.
2. Usunąć `wotcv-pull-build-restart.sh`, jeśli pozostaje wyłącznie wrapperem `wotcv-branch-build-deploy.sh`.
3. Zdecydować, czy `update_rybbit_wotcv.sh` ma być utrzymywanym wrapperem instalowanym do `/home/wotcv/tools`, czy szablonem w deployment docs.
4. Nie uruchamiać repozytorium przez `sudo`; naprawić właściciela katalogów jako osobny krok administracyjny.
5. Wszystkie skrypty mają:
   - `set -Eeuo pipefail`,
   - lock,
   - czytelny trap błędu,
   - jawny katalog repo,
   - kontrolę czystego worktree,
   - timeout healthchecku,
   - bezpieczne logi bez sekretów.
6. Dodać `shellcheck` do CI lub przynajmniej do checklisty.
7. Ujednolicić format `.wotcv-deployment.env`.

### Kryteria akceptacji

- operator ma jedno polecenie aktualizacji lokalnego buildu,
- skrypt działa niezależnie od bieżącego katalogu,
- rollback korzysta z poprzednich obrazów i nie dotyka wolumenów,
- nie ma trzech wrapperów wykonujących ten sam build.

### Proponowany commit

`refactor(deploy): consolidate WoT-CV operational scripts`

## Etap 18 — build, artefakty generowane i obrazy

### Cel

Zapewnić deterministyczne artefakty oraz ograniczyć konflikty z upstreamem.

### Zadania

1. Potwierdzić, że upstream nadal wersjonuje `server/public/script*.js`.
2. Dodać CI wykonujące build trackera i sprawdzające brak diffu.
3. Zachować banner AGPL-3.0 zarówno w źródle, jak i minifikowanym bundlu.
4. Zablokować przypadkowe ręczne edycje `server/public/script*.js` w dokumentacji developerskiej.
5. Sprawdzić reprodukowalność bundla na tej samej wersji Node/npm.
6. Zweryfikować ARG/ENV/LABEL w obu Dockerfile.
7. Ujednolicić `WOTCV_GIT_SHA`, `WOTCV_IMAGE_TAG`, `WOTCV_BUILD_TIME` i `WOTCV_DEPLOYED_AT`.
8. Sprawdzić, czy klient potrzebuje wszystkich metadanych runtime, czy tylko SHA wbudowanego podczas buildu.
9. Dodać kontrolę Compose dla nazw wolumenów, portu Postgresa i projektu `rybbit`.

### Kryteria akceptacji

- build dwukrotnie daje ten sam logiczny artefakt,
- CI wykrywa niezbudowany tracker,
- `/api/health` jednoznacznie identyfikuje wdrożony kod,
- wolumeny danych nie są tworzone pod nową nazwą projektu.

### Proponowany commit

`build(wotcv): make generated artifacts and metadata reproducible`

## Etap 19 — zgodność AGPL-3.0

### Cel

Zachować i automatycznie sprawdzać wykonane obowiązki informacyjne forka.

### Zadania

1. Zachować `LICENSE.md`, `NOTICE.md` i informację o modyfikacjach.
2. Zachować odnośnik do dokładnego SHA źródeł w UI i odpowiedziach serwera.
3. Dodać test `/api/source` i nagłówków `Link`/`X-Source-Code`.
4. Sprawdzić fallback dla buildu bez SHA.
5. Sprawdzić odnośnik źródłowy w login, signup, sidebar i footer.
6. Zachować banner w trackerze.
7. Dokumentować sposób udostępnienia kompletnego odpowiadającego kodu źródłowego wdrożonej wersji.

### Kryteria akceptacji

- każdy uruchomiony build wskazuje publicznie dostępne źródło,
- URL wskazuje dokładne SHA, jeśli metadane są dostępne,
- usunięcie informacji źródłowej powoduje błąd testu.

### Proponowany commit

`test(license): verify source availability for AGPL deployments`

## Etap 20 — konfiguracja narzędzi jakości

### Cel

Oddzielić prawdziwy martwy kod od entrypointów i artefaktów błędnie zgłaszanych przez narzędzia.

### Zadania

1. Dodać konfigurację `knip` dla klienta i serwera.
2. Oznaczyć entrypointy:
   - Next.js routes,
   - build trackera,
   - cluster entrypoint,
   - skrypty administracyjne,
   - generowane public assets.
3. Dopiero po konfiguracji usunąć potwierdzone nieużywane eksporty WoT-CV.
4. Uruchomić Prettier i naprawić `git diff --check` w osobnym commicie.
5. Dodać `format:check`, `knip`, audyt tłumaczeń i build trackera do workflow.
6. Nie naprawiać całego długu upstreamu w tym samym PR; ograniczyć bramkę do nowego kodu lub ustalonego baseline.

### Kryteria akceptacji

- raport `knip` nie zgłasza legalnych entrypointów,
- nowy martwy kod powoduje błąd CI,
- `git diff --check` jest czysty,
- commit nie zawiera masowego formatowania niezwiązanych plików.

### Proponowany commit

`chore(quality): configure static analysis for fork code`

## Etap 21 — testy regresyjne i macierz walidacji

### Cel

Zakończyć sprzątanie z mierzalną ochroną funkcji.

### Minimalny zakres automatyczny

#### Client

- parser Network Replay,
- filtry host/method/status/duration,
- correlation ID i transfer size,
- segmentacja aktywności,
- seek i zachowanie play/pause,
- wybór zakresu eksportu,
- Growth Accounting mapper i legenda,
- resolver identity/avatar,
- capability flags,
- kontrola kompletności `pl.json`.

#### Server

- konfiguracja Network Replay,
- ingest i kolejność eventów,
- Growth Accounting query/mapping,
- schema eksportu,
- uprawnienia eksportu,
- queue limits i cleanup,
- filtr hosta w paczce eksportowej,
- endpointy health/source.

#### Tracker

- fetch/XHR lifecycle,
- body i header capture,
- limity rozmiarów,
- retry i unload,
- wykluczenia własnych endpointów.

### Minimalny zakres ręczny po wdrożeniu

1. Chrome, Firefox, Edge, Safari/mobile Safari, jeśli dostępne.
2. Sesja desktop i mobile.
3. Stare i nowe nagranie.
4. Autoplay po kliknięciu sesji.
5. Seek przez marker aktywności i request sieciowy.
6. Pomijanie długiej bezczynności.
7. Eksport 1 s, 30 s i 2 min.
8. Pobranie paczki i sprawdzenie zawartości.
9. Growth Accounting day/week.
10. Pages, Performance i Bots na self-hosted.
11. Widoczność polskich tekstów.
12. Link do źródła dokładnego SHA.

### Proponowany commit

`test(wotcv): add regression coverage for fork features`

## Etap 22 — odporność na merge z upstreamem

### Cel

Zmniejszyć koszt kolejnych aktualizacji `master`.

### Zadania

1. Utrzymywać `master` jako możliwie czyste odzwierciedlenie upstreamu.
2. Wprowadzać `master` do `feat/wotcv` przez jawny merge, bez force-push na wdrożoną gałąź.
3. Dokumentować konflikty w `WOTCV_FORK_DIFFERENCES.md`, nie w kolejnych planach etapowych.
4. Ograniczyć modyfikacje dużych plików upstreamu przez adaptery i małe punkty integracji.
5. Szczególnie monitorować:
   - `server/src/analytics-script/sessionReplay.ts`,
   - `server/src/index.ts`,
   - `server/src/db/postgres/schema.ts`,
   - `client/src/components/replay/**`,
   - `client/src/app/[site]/components/Sidebar/Sidebar.tsx`,
   - `client/messages/*.json`,
   - Dockerfile i Compose.
6. Po każdym merge uruchomić pełną macierz z etapu 21.
7. Porównać nowe funkcje upstreamu z lokalnymi implementacjami i usuwać lokalny kod, gdy upstream oferuje równoważne lub lepsze rozwiązanie.

### Kryteria akceptacji

- merge nie miesza zmian upstream z refaktorem WoT-CV,
- każdy konflikt ma decyzję: zachowaj upstream, zachowaj fork, połącz albo usuń lokalny odpowiednik,
- dokument różnic jest aktualizowany w tym samym commicie co zmiana granicy forka.

### Proponowany commit

`docs(upstream): document fork merge hotspots and procedure`

## Etap 23 — końcowy audyt i zamknięcie sprzątania

### Cel

Potwierdzić, że plan został zrealizowany i usunąć tymczasowe materiały.

### Zadania

1. Porównać końcowy diff z baseline etapu 0.
2. Potwierdzić brak regresji funkcjonalnych.
3. Uruchomić wszystkie komendy walidacyjne.
4. Sprawdzić `git diff --check`.
5. Sprawdzić brak martwych odnośników dokumentacji.
6. Zaktualizować `WOTCV_FORK_DIFFERENCES.md` i runbook.
7. Usunąć `WOTCV_CODE_CLEANUP_PLAN.md` albo zastąpić go krótkim raportem zakończenia bez historii implementacyjnej.
8. Oznaczyć stabilne SHA możliwe do wdrożenia.

### Proponowany commit

`chore(cleanup): complete WoT-CV fork stabilization`

## 8. Kolejność i zależności

Zalecana kolejność wykonania:

1. Etapy 0–2 — baseline, dokumentacja i wspólne stałe.
2. Etapy 3–7 — kontrakty, konfiguracja, recorder, transport i parser.
3. Etapy 8–12 — player, autoplay, aktywność, timeline i eksport.
4. Etapy 13–16 — Growth Accounting, identity, self-hosted i i18n.
5. Etapy 17–20 — deployment, build, licencja i narzędzia jakości.
6. Etapy 21–23 — testy, upstream i końcowy audyt.

Etap 10 musi zostać wykonany przed finalnym uproszczeniem eksportu, ponieważ UI i renderer mają korzystać z tej samej definicji aktywności. Etap 2 powinien poprzedzić wszystkie zmiany limitów i konfiguracji. Etap 20 powinien poprzedzić masowe usuwanie wyników `knip`.

## 9. Strategia commitów

Każdy etap powinien być osobnym commitem lub małą serią commitów, jeśli zawiera niezależne zmiany klienta i serwera.

Zasady:

- nie łączyć merge upstreamu ze sprzątaniem,
- nie łączyć formatowania ze zmianą zachowania,
- nie usuwać dokumentacji w innym commicie niż przeniesienie wiedzy,
- nie commitować wygenerowanego trackera bez odpowiadającej zmiany źródła,
- nie zmieniać migracji już użytej na serwerze; ewentualne korekty wymagają nowej migracji wygenerowanej zgodnie z zasadami projektu,
- przed każdym commitem sprawdzić diff ograniczony do danego etapu,
- po etapie wpływającym na runtime wykonać co najmniej targeted build/typecheck.

## 10. Czego nie robić podczas sprzątania

1. Nie resetować danych produkcyjnych.
2. Nie uruchamiać migracji bazy danych.
3. Nie usuwać `NOTICE.md`, source links ani bannerów licencyjnych.
4. Nie usuwać innych języków poza polskim.
5. Nie przepisywać wszystkich plików locale tylko dla zmiany kolejności.
6. Nie zastępować działającego algorytmu nową funkcją bez testów porównawczych.
7. Nie zmieniać publicznego formatu eventów bez wersjonowania.
8. Nie łączyć klienta, serwera i skryptów w jeden monolityczny moduł `wotcv`.
9. Nie usuwać artefaktów generowanych przed ustaleniem konwencji upstreamu.
10. Nie naprawiać całego długu technicznego Rybbit niezwiązanego z forkiem.
11. Nie używać `sudo` do zwykłego pull/build, ponieważ ponownie zmieni właściciela plików repozytorium.
12. Nie wykonywać force-push na gałąź aktualnie używaną do wdrożenia.

## 11. Definition of Done

Sprzątanie można uznać za zakończone, gdy:

- istnieje jeden aktualny dokument różnic forka i jeden runbook wdrożenia,
- dokumenty etapowe zostały usunięte po przeniesieniu wiedzy,
- Network Replay ma jeden kontrakt i jedną konfigurację domyślną,
- replay UI i eksport korzystają z tej samej segmentacji aktywności,
- rrweb jest obsługiwany przez typowany adapter,
- autoplay nie korzysta z magicznych timeoutów,
- API eksportu nie zawiera nieużywanych opcji,
- limit eksportu i host logów są definiowane centralnie,
- Growth Accounting ma testy definicji day/week,
- identity/avatar jest spójne w Users, Replay i Globe,
- self-hosted korzysta z capability flags,
- audyt polskiego ma niski poziom fałszywych trafień i działa jako bramka,
- skrypty operacyjne nie dublują odpowiedzialności,
- artefakty trackera są reprodukowalne,
- source links i informacje AGPL-3.0 są sprawdzane automatycznie,
- nowe funkcje mają testy regresyjne,
- pełny build klienta i serwera przechodzi,
- `git diff --check` jest czysty,
- merge najnowszego `master` nie usuwa funkcji WoT-CV.
