# Rybbit WoT-CV — analiza i plan bezpiecznej synchronizacji, 24.09.2026

## 1. Cel, kierunek i granice uprawnień

Włączamy `origin/master` do `feat/wotcv`, nie odwrotnie. `master` pozostaje odzwierciedleniem upstreamu, a `feat/wotcv` zachowuje funkcje WoT-CV. Samo wyrównanie historii nie oznacza identyczności plików obu branchy — różnice realizujące wymagania forka mają pozostać.

Zakres wykonania: analiza, lokalny merge, naprawa odtwarzania mobilnego, testy, self-review. Bez commita, pushu, deploymentu, produkcyjnych migracji, restartów, zapisu do baz i zmian konfiguracji serwera. SSH służy wyłącznie do diagnostyki. Nie odczytujemy haseł, ciastek sesyjnych ani prywatnych kluczy.

## 2. Zamrożone punkty odniesienia

| Element | Wartość zweryfikowana przed integracją |
| --- | --- |
| `feat/wotcv`, HEAD i `origin/feat/wotcv` | `5c40c99e8b8b40a5dddfe3285f4dcccc9b14377c` |
| Źródło integracji `origin/master` po fetch | `221fbaa7227e1d8c3591a00d8bca7250e835d6d6` |
| Wspólna baza | `85a77b4576b49b6a7ebb487edd1a67f6ba7cf490` |
| Commity tylko po stronie forka / upstreamu | 129 / 9 |
| Ścieżki różniące fork od bazy / upstream od bazy | 554 / 73 |
| Ścieżki zmienione po obu stronach | 16 |
| Konflikty próbnego `merge-tree` | 8 ścieżek, w tym modify/delete lockfile backendu |
| Główny checkout | czysty, `C:\PROJECTS\rybbit-wotcv` |
| Starszy worktree integracji 19.09 | istnieje; nie jest modyfikowany ani usuwany |
| Produkcja podczas kontroli SSH | 2.9.1, SHA `5c40c99e…`, health OK |

Nie używamy lokalnego `master`, który pozostaje na starszym SHA. Analizujemy trzy porównania: baza→fork (wymagania do zachowania), baza→upstream (nowości), fork→wynik (rzeczywista zmiana dla produkcji).

## 3. Analiza nowych zmian upstreamu

### 3.1. Narzędzia, zależności i obrazy — ryzyko wysokie

Commit `8ea0b218` wprowadza pnpm 10.33.0, workspace `client/server/shared`, jeden `pnpm-lock.yaml`, `workspace:*` i izolowane zależności. Usuwa trzy aplikacyjne lockfile npm i lokalne `.npmrc`. `docs` pozostaje osobnym projektem npm. Nowszy commit `9cc84b82` ustala wspólny katalog śledzenia zależności Next.js/Turbopack.

Konsekwencje dla forka:

1. Nie wolno zostawić npm CI w workflow budującym obrazy WoT-CV.
2. Lockfile upstreamu nie jest automatycznie kompletny dla manifestów forka. Należy zachować BullMQ, narzędzia eksportu Replay, testy i wszystkie forkowe skrypty.
3. pnpm ujawnia importy przechodnich zależności. Szczególnie sprawdzić `@rrweb/types`, rrweb i biblioteki eksportu — dotychczasowy płaski npm mógł maskować brak deklaracji.
4. Backend `pnpm deploy --legacy --prod` musi zawierać `shared/dist`, źródła schematu potrzebne Drizzle, migracje, GeoIP, publiczne/prekompresowane skrypty oraz wszystkie moduły uruchamiane w runtime.
5. Runtime musi zachować Chromium, ffmpeg, klienta PostgreSQL, etykiety OCI, SHA, AGPL i dotychczasową ścieżkę aplikacji `/app`.
6. Next standalone musi faktycznie uruchamiać `client/server.js` wraz z zasobami i workspace. Nie wystarczy przejście TypeScript.
7. Polecenie migracyjne skryptów deploy nadal musi działać w produkcyjnym obrazie. Sprawdzić bez uruchamiania migracji; w runtime npm nadal może wywołać skrypt z lokalnego bin, nie wymagamy tam pnpm.
8. Wykluczenia `.env` w `.dockerignore` są pożądane i muszą pozostać.
9. Nie podnosimy przypiętego Better Auth 1.7.3. Nie wykonujemy masowego `audit fix --force` ani zmiany majorów poza uzgodnioną migracją narzędzi upstreamu.

### 3.2. Batch kart witryn — ryzyko średnie/wysokie

`eb2aaf51` zastępuje wiele zapytań kart strony głównej jednym batch API, obsługując surowe eventy i wariant lite/MV. Payload ogranicza batch do 20 witryn. Każda witryna musi należeć do wskazanej organizacji i do efektywnego zbioru uprawnień użytkownika. Parametry okresu i porównania są walidowane.

Sprawdzić: użytkownik bez dostępu, mieszany batch uprawnionych/obcych siteId, zakresy poprzedniego okresu, puste serie, nakładające się okresy, ta sama session_id na różnych witrynach, identyfikacja historyczna przez `user_identity_dict`, brak podwójnego liczenia po identify. Forkowy `EFFECTIVE_SESSION_USER_ID` musi być używany zamiast cofnięcia do prostego user_id.

### 3.3. Współdzielony cache analityki — ryzyko wysokie

`a404e376` wprowadza Redis cache GET-ów i koalescencję żądań między workerami. Domyślny TTL 30 sekund, limit payload 256 KiB, odnawiany lease i fallback przy awarii Redis. Klucz zawiera trasę, parametry i rozwinięte filtry/segmenty. Kontrola dostępu musi nastąpić przed odczytem cache, również przy HIT.

Sprawdzić szczególnie:

- kolejność auth→site access→scope→time validation→segment expansion→cache;
- prywatne linki, cofnięcie uprawnień i segmenty prywatne — cache nie jest mechanizmem autoryzacji;
- zakres organizacji, siteId, timezone, query, okresu i trybu lite;
- namespace między różnymi bazami i wdrożeniami, brak współdzielenia niezgodnych odpowiedzi podczas rolling update;
- TTL od startu zapytania, brak cache błędów jako sukcesu, rozłączenie klienta, wygaśnięcie lease, brak Redis;
- konfigurację TTL dla obu plików Compose i przykładów .env;
- brak dodania replay, sesji, użytkowników lub surowych danych do ogólnego cache bez odrębnej analizy.

### 3.4. Dokładne krótkie okna czasowe — ryzyko średnie

`76861283` używa surowych eventów dla krótkich rolling windows zamiast niedokładnych godzinowych agregatów. `0ed18c56` zapisuje wybór okresu na stronie głównej w URL. Zachować obecne forka filtry, daty, timezone, prywatne linki i parsery. Testować minute/hour/day, granice okresów, bieżący i porównawczy zakres, daty historyczne, niepoprawne wartości i zmianę strefy.

### 3.5. Własne SQL — ryzyko średnie/wysokie

`8e627f10` podnosi czas zapytania do 60 sekund i porządkuje komunikaty ClickHouse, w tym kody przekazywane w polu `error.code`. Zachować konto least-privilege, brak fallbacku do admina, limity pamięci/wątków/wierszy/równoległości oraz ograniczenie do scoped_events. Timeout HTTP ma być dłuższy niż limit zapytania. Błąd nie może ujawniać danych innych witryn lub szczegółów połączenia.

### 3.6. Zmiany o niższym ryzyku

Logo sponsora dokumentacji oraz instrukcje workspace można przyjąć. Nie ma nowych migracji PostgreSQL, zmian schematu ani zmiany Better Auth względem bieżącego forka. Obie aplikacje nadal mają semver 2.9.1 — nowy SHA nie musi oznaczać nowej etykiety wersji.

## 4. Macierz funkcji forka do zachowania

| Obszar | Nienaruszalny warunek | Dowód odbioru |
| --- | --- | --- |
| Identity Resolution v2 | Site-scoped aliasy PostgreSQL/CH dictionary, historia anonimowa, brak mutacji historycznych CH | Testy identity, SQL i scope; diff helperów |
| Replay | V1/V2, V1 domyślnie, 30d TTL, metadane i ingest | Testy serwera i niezmienione definicje retencji |
| Network Replay | Kontrakt shared, sanitizacja, filtry i synchronizacja | Testy recordera/parserów/konfiguracji |
| Eksport replay | BullMQ, Chromium, ffmpeg, limity i prywatność | Manifest + runtime contents + testy export |
| Growth Accounting | Własne endpointy/karty, dzienny/tygodniowy model | Suite oraz niezmienione kontrakty |
| Self-hosted | Pages/Bots/Performance/Query/Dashboards bez CLOUD=true | Capabilities, sidebar, testy |
| Integracje opcjonalne | GSC/OAuth/Resend/Turnstile/R2/Twilio tylko przy konfiguracji | Testy capabilities, brak ujawnienia sekretów |
| Administrator | Zarządzanie organizacjami i uprawnieniami | Testy admin/member/site/team |
| Onboarding | Unclaimed sites domyślnie off, brak niejawnego cleanupu | Istniejące testy gating |
| Mapbox | Publiczny token domyślny, konfiguracja runtime ma pierwszeństwo | Test getConfig; token nie jest powielany w raporcie |
| AGPL/build | Dokładny source SHA, etykiety, health, skompresowany tracker | Source metadata/asset tests/build |
| Baza PostgreSQL | SQL, snapshoty i journal 0000–0020 pozostają identyczne | Porównanie Git + migrationLineage + db:check |
| Auth | Better Auth 1.7.3; zachowane cutover/rollback guards | Test auth guard, manifest/lock |
| Docker Compose | Projekt rybbit, external volumes, loopback, Redis bez portu hosta | Python persistence + skuteczna konfiguracja na CI/staging |
| Język polski | Brak usuwania tłumaczeń/placeholderów | PL audit, extraction przy nowych etykietach |

## 5. Plan rozwiązania ośmiu konfliktów

| Plik | Decyzja |
| --- | --- |
| `.github/workflows/test.yml` | pnpm setup/install/cache dla aplikacji, npm dla docs; zachować UTC, feat/wotcv, bounded workers i testy docs |
| `client/Dockerfile` | Przyjąć pnpm deps/build i workspace standalone; zachować build args/OCI/SHA forka, użytkownika nextjs, port 3002 |
| `client/next.config.ts` | Jeden repository root dla Turbopack i output tracing; zachować shared transpilation/alias i env SHA |
| `client/package.json` | Suma intencjonalnych skryptów i zależności; workspace shared; brak zdublowanego test:run; zachować wszystkie bramki WoT-CV |
| `docker-compose.yml` | Dodać TTL cache bez utraty polityki portów/persistence/capabilities |
| `server/Dockerfile` | pnpm deploy portable runtime; zachować ffmpeg, metadane oraz prekompresję; zweryfikować zawartość runtime |
| `server/package-lock.json` | Usunąć w wyniku przejścia na jeden workspace lockfile, nie pozostawiać dwóch źródeł prawdy |
| `server/package.json` | Zachować build:compressed-assets/check:analytics, BullMQ i zależności forka; przyjąć pnpm i runtime drizzle-kit |

Pozostałe osiem wspólnie zmienionych plików też wymaga semantycznego review mimo automatycznego merge: README, server/.env.example, tracker, analytics/index, queryUser/test, redis, server/index. Dodatkowo workflow `build-wotcv-images.yml` nie konfliktuje, ale wymaga ręcznej migracji npm→pnpm.

## 6. Procedura wykonania lokalnej integracji

1. Potwierdzić czysty main checkout, właściwy branch, brak MERGE_HEAD i niezmienione SHA.
2. Utworzyć nazwany backup ref aktualnego feat/wotcv, bez zmiany istniejących backupów.
3. Utworzyć NOWY izolowany worktree/branch dla tej daty. Nie używać starego worktree z 19.09, nie usuwać jego zmian.
4. Wykonać normalny merge dokładnego SHA `221fbaa7…` z `--no-ff --no-commit`; bez rebase/squash/strategii ours dla całych plików.
5. Rozwiązać konflikty zgodnie z tabelą i przeczytać automatycznie scalone punkty bezpieczeństwa.
6. Zaktualizować wszystkie aktywne konsumenty package managera. Nie zmieniać historycznych raportów jako rzekomo nowych wyników.
7. Uzgodnić manifesty i wygenerować lockfile pnpm; czysta instalacja zgodna z lockfile w nowym worktree. Nie usuwać lub nadpisywać istniejących node_modules używanych przez cudze procesy.
8. Uruchomić szybkie typecheck/build shared i ukierunkowane testy, zanim zacznie się kosztowne buildy.
9. Wprowadzić mobilną poprawkę wraz z testem regresji (poniżej).
10. Pełna walidacja, review diffu fork→wynik i zabezpieczeń historycznych.
11. Jeśli główny checkout nadal jest czysty i na początkowym SHA, przenieść dokładnie zweryfikowane drzewo do operacji merge na feat/wotcv. Jeżeli użytkownik wprowadził zmiany równolegle, nie nadpisywać ich — najpierw uzgodnić kolizje.
12. Pozostawić rozwiązaną operację merge do commita użytkownika, podać stan Git i instrukcje. Nie robić pushu i nie aktualizować produkcji.

## 7. Diagnostyka mobilnego Replay — plan dowodowy

### 7.1. SSH, wyłącznie odczyt

1. Zweryfikować zegar UTC i przeliczenie 00:20 PL na 22:20 UTC dnia poprzedniego; zapytać, czy chodziło o zegar, czy pozycję nagrania.
2. Sprawdzić health, semver, SHA, start/restart/OOM kontenerów.
3. W wąskim oknie porównać statusy pobrania replay, sesji i auth. Nie wypisywać tokenów ani treści nagrań.
4. Sprawdzić logi proxy dotyczące wyłącznie tracking.wot-cv.com, ograniczając output do czasu/ścieżki/statusu/rozmiaru/przeglądarki.
5. Rozdzielić błędy backendu od reloadu strony, zgubionego stanu panelu i gestu zamknięcia. Log HTTP 200 sam nie potwierdza poprawności odtwarzania JS.
6. Nie traktować restartu około 00:22–00:24 jako przyczyny wcześniejszej próby bez korelacji z użytkownikiem/logami.

### 7.2. Inspekcja i reprodukcja lokalna

1. Zbadać ReplayDrawer, odtwarzacz rrweb, ActivitySlider, Select prędkości, hook seek, inactivity i stan wyboru sesji.
2. Sprawdzić domyślny swipe-to-dismiss Vaul oraz bubbling pointer/touch events z kontrolek.
3. Sprawdzić liczbę pełnych `goto/seek` na serię pointermove, koszt rekonstrukcji DOM i zachowanie po pointercancel.
4. Sprawdzić układ przy 390×844 oraz 375/320 px, orientację poziomą i zmianę rozmiaru viewportu Safari.
5. Nie dokładać automatycznego zamykania lub redirectu po błędzie odtwarzacza.
6. Reprodukować na danych syntetycznych bez produkcyjnej sesji użytkownika. Osobno testować zmiany 1x/2x/4x, przewijanie w przód/wstecz, anulowany dotyk, autoplay/pause, otwarcie/zamknięcie, listę sesji odświeżaną w tle.
7. Naprawić potwierdzone mechanizmy; nie deklarować, że emulacja jest rzeczywistym Safari/iOS. Brak Browser plugin: użyć istniejącego Playwright. Artefakty UI poza repo.

### 7.3. Kryteria odbioru Replay

- Panel nie zamyka się przy obsłudze suwaka i wyborze prędkości.
- Pozostaje świadomy, dostępny sposób zamknięcia.
- Końcowa pozycja seek odpowiada gestowi; wcześniejszy play/pause zostaje zachowany.
- Stare callbacki/gesty nie sterują nową sesją lub zniszczonym odtwarzaczem.
- Brak pętli restartowania rrweb przy zwykłym resize/refetch.
- Obsługa błędów nie gubi kontekstu użytkownika.
- Desktop, eksport i skip inactivity nie mają regresji.

## 8. Macierz walidacji i bramki STOP

| Warstwa | Minimalna kontrola | STOP gdy |
| --- | --- | --- |
| Git | Brak konfliktów, diff --check, upstream w MERGE_HEAD, niezmieniona baza | Zmienił się HEAD/dirty tree użytkownika |
| Workspace | pnpm 10.33.0 + frozen lockfile; brak niejawnych importów | Lock niezgodny, niejawny upgrade auth |
| Backend | Wszystkie Vitest, typecheck/build, db:check, check:analytics | Nieprzechodzące scope/identity/migration tests |
| Frontend | Wszystkie Vitest, typecheck, lint WoT-CV, Knip, PL audit, format, production build | Utracone funkcje forka / build ze starych deps |
| SQL/cache | Testy query limits, batch scope, cache order/fallback, identity | Dostęp do cudzych danych lub admin fallback |
| Deploy | Python guard suite + bash syntax + YAML/config | Zmienione wolumeny, publikacja Redis, utrata guardów |
| Runtime | Przenośne pnpm deploy, shared/drizzle/assets/ffmpeg | Brak modułów lub linki poza runtime |
| Dokumentacja | Build/guide lint/readiness adekwatnie do zmian root tracing | Inna zależność docs lub brak output |
| Replay | Repro przed/po, regresje gestów, speed/seek, screenshot i console | Niepotwierdzona poprawka lub regresja desktop |
| Self-review | Ponowne czytanie diffu i macierzy forkowej, rerun po fixach | Niezaadresowany defekt w zakresie zmian |

Jeżeli nie ma lokalnego Dockera, nie zastępujemy prawdziwego builda OCI samym parsowaniem YAML. Raport jawnie rozdzieli testy wykonane od warunków przyszłego CI/staging. Nie wykorzystujemy produkcji jako środowiska build/test.

## 9. Późniejsze wdrożenie (nie jest wykonywane w tym zadaniu)

1. Użytkownik zatwierdza merge i wykonuje push; CI buduje dokładny SHA.
2. CI/staging sprawdza oba obrazy i architektury, runtime imports, ffmpeg/Chromium/Drizzle/shared, porty i wolumeny.
3. Operator robi aktualny backup i kontrolę odtworzenia. Backup z 19.09 nie jest aktualnym zabezpieczeniem tego wdrożenia.
4. Sprawdzić, że bieżący auth ma 1.7.3 i migracja 0018 została zastosowana; nie powtarzać starego jednorazowego skryptu cutover.
5. Standardowy deploy forka ze sprawdzeniem SHA, zdrowia, wersji, słownika identity i liczników danych/chronionej kohorty TTL.
6. Smoke: istniejące konto, statystyki, filtry URL, karty witryn, replay na rzeczywistym iPhonie, prędkości/seek/eksport, intake nowych eventów, source link.
7. Rollback wyłącznie zgodny z aktualną bazą/auth. Nie robić downgrade PostgreSQL ani restore starej bazy bez osobnej procedury.

## 10. Raport wykonania

### 10.1. Wynik implementacji

Wykonano integrację upstreamu `221fbaa7227e1d8c3591a00d8bca7250e835d6d6` z forkiem `5c40c99e8b8b40a5dddfe3285f4dcccc9b14377c` w izolowanym worktree. Rozwiązano osiem konfliktów i zachowano osobne funkcje forka. Zweryfikowany wynik przeniesiono do głównego checkoutu jako normalny, rozwiązany merge na `feat/wotcv`, bez tworzenia commita. Oba indeksy mają identyczne drzewo, brak konfliktów i zmian niestage'owanych. Dopiero commit merge dopisze drugiego rodzica do historii; sam rozstrzygnięty indeks nie oznacza jeszcze, że `git merge-base --is-ancestor` potwierdzi włączenie upstreamu do HEAD.

Zabezpieczenie: branch `backup/feat-wotcv-5c40c99e-before-master-221fbaa7`. Starszy worktree z 19.09 pozostawiono bez zmian. Nie wykonywano pushu ani deploymentu.

### 10.2. Istotne decyzje i dodatkowe poprawki z review

1. Jeden pnpm workspace dla client/server/shared; docs nadal ma własne npm i lockfile. Workflow testów, tłumaczeń i obrazów korzystają ze zgodnego menedżera.
2. Backend jest pakowany przez `pnpm deploy --legacy --prod`. Zachowano `drizzle-kit`, `pino-pretty`, BullMQ, Chromium/ffmpeg w Dockerfile, źródła Drizzle, migracje, GeoIP i skompresowane assety. Entrypoint wywołuje lokalny bin Drizzle, bez wymagania pnpm w runtime.
3. Dodano bezpośrednią zależność typów `@rrweb/types`. Naprawiono niejawny peer Zod w `@hookform/resolvers@5.0.1` przez wąski `packageExtensions`: adapter ma używać wersji klienta, a nie innej wersji podniesionej do wspólnego node_modules. Przed poprawką TypeScript zgłaszał nadmierną instancjację typów i przekraczał domyślny heap; po poprawce przechodzi bez zwiększania heap.
4. Namespace cache uwzględnia bazę ClickHouse, SHA wdrożenia i efektywny tryb Identity v2. Zapobiega mieszaniu wyników starego/nowego kodu we wspólnym Redis. Kolejność autoryzacji i rozwijania segmentów przed odczytem cache pozostała zachowana.
5. Samo przejście na nowszy Next ujawniło różnice hydratacji sesji/administratora oraz przycisków dat przy różnej strefie czasowej serwera i klienta. Wprowadzono mały `useHydrated` oparty na `useSyncExternalStore`, bez maskowania błędów przez suppressHydrationWarning.
6. Self-hosted nie odpytuje subskrypcji Stripe i nie ładuje Stripe.js bez klucza publicznego. Nie zmieniano API płatności, planów ani przypiętego backendowego Stripe.
7. Nowa walidacja ip-address odrzuca niekanoniczny IPv4 z wiodącymi zerami; test celowo oczekuje odrzucenia także takiego CIDR. Jest to świadoma zmiana walidacji, a nie poluzowanie ochrony.
8. Wyłączono automatyczne generowanie instrukcji agentów przez Next podczas build/dev; usunięto wyłącznie wygenerowany w tym zadaniu dopisek. Mechaniczne przestawienie kluczy docs/messages po buildzie cofnięto po porównaniu wszystkich wartości — brak zmian tłumaczeń dokumentacji.
9. Przeczytano automatycznie scalone punkty bezpieczeństwa: routowanie/scope, Redis, użytkownik ograniczony dla SQL, karty organizacji i semantyka identity. Żadna migracja PostgreSQL, istniejący SQL/snapshot/journal, konfiguracja auth, helper identity ani produkcyjny overlay persistence nie zostały zmienione przez tę integrację.

### 10.3. SSH i problem iPhone — co jest potwierdzone

Analizowano noc 23/24.09.2026, przy założeniu że „około 00:20” oznacza czas Europe/Warsaw, nie dwudziestą sekundę nagrania. Nie otrzymano dodatkowego potwierdzenia tego założenia.

| Czas lokalny | Dowód z logów |
| --- | --- |
| 00:19:10 | Pobranie Replay przez iPhone: HTTP 200, 3 334 441 bajtów odpowiedzi |
| 00:19:18 | Ponowna sekwencja żądań konfiguracji/auth/listy sesji |
| 00:20:06 | Pobranie kolejnego Replay: HTTP 200, 22 183 325 bajtów odpowiedzi |
| 00:20:17 | Ponowna sekwencja startowa konfiguracji/auth/organizacji/listy sesji, po około 11 sekundach |
| 00:21:15 | Kolejna podobna sekwencja |
| 00:22–00:24 | Osobny epizod rozłączenia Redis/DNS i startów usług; nie dowodzi przyczyny wcześniejszego problemu |

Odczyt agregatów dla dużej powtórki: 7631 zdarzeń, 15 pełnych snapshotów, 21 838 888 bajtów JSON w bazie, największe zdarzenie 890 276 bajtów, około 493 sekund nagrania. Nie pobierano treści produkcyjnej powtórki do lokalnych testów. Raport nie zawiera adresów IP, tokenów, ciastek ani identyfikatorów produkcyjnych sesji.

Nie znaleziono 401/5xx odpowiadających badanej próbie. Sekwencja żądań jest zgodna z ponownym załadowaniem/remontażem aplikacji po poprawnym pobraniu danych. Nie pozwala rozstrzygnąć, czy Safari ubiło proces z powodu pamięci, wystąpił błąd JavaScript, czy użytkownik przeładował stronę. Brak OOM w Dockerze nie wyklucza OOM na telefonie.

Końcowy odczyt SSH 24.09 około 01:21 PL: produkcja nadal na SHA `5c40c99e…`, health OK, backend/client/ClickHouse/Redis running, restartCount=0 i OOMKilled=false. Nie zmieniono serwera.

### 10.4. Naprawa Replay

Potwierdzone problemy kodu i wprowadzone zabezpieczenia:

- Stary preview suwaka wykonywał pełny rrweb seek przy każdym ruchu palca. Test serii 71 zmian wykazał 71 rekonstrukcji; nowa implementacja zmienia tylko pozycję UI i wykonuje jeden seek po zatwierdzeniu.
- Preview pauzuje tylko raz i przy commit zachowuje wcześniejsze play/pause. Pointercancel/lost capture przywraca poprzednią pozycję. Odrzucane są NaN/Infinity i callbacki starego wyboru sesji/odtwarzacza.
- Kontrolki nie propagują gestu do mechanizmu przeciągania/zamykania Vaul. Pozostaje jawny przycisk zamknięcia i dostępny tytuł panelu.
- Zamknięte drawery na liście sesji nie subskrybują całego zegara odtwarzania. Test 100 zamkniętych paneli potwierdza brak ponownych renderów na tickach.
- Na telefonie nie jest montowana kosztowna, ukryta CSS-em boczna oś zdarzeń.
- Query nie pobiera powtórki ponownie przy samym odzyskaniu focusu; po utracie wszystkich konsumentów duże dane nie pozostają przez domyślny czas w nieaktywnym cache.
- Zmiana samego obiektu metadanych nie odtwarza instancji rrweb, gdy tablica zdarzeń jest ta sama.
- Cleanup usuwa obserwatory/listenery i instancję także przy częściowo nieudanej inicjalizacji. Stan play/paused przy ukrywaniu strony odczytywany jest z rzeczywistego stanu odtwarzacza.
- Naprawiono pomiar portalu Vaul: ResizeObserver zostaje przypięty do faktycznie zamontowanego kontenera. Dzięki temu pojawienie się bocznej osi lub resize zmienia rozmiar playera zamiast zasłaniać sidebar.
- Kontrolki zawijają się przy 320 px; użyto wysokości dynamicznego viewportu i poprawnych ograniczeń flex.

Uczciwa granica wyniku: bazowy test Playwright nie odtworzył samoistnego zamknięcia panelu z telefonu użytkownika. Odtworzono i usunięto konkretne problemy wydajności, stanu i układu, ale nie potwierdzono jednej wyłącznej przyczyny awarii rzeczywistego Safari. Odbiór na fizycznym iPhonie po wdrożeniu pozostaje konieczny.

### 10.5. Wykonane testy i kontrole

| Kontrola | Wynik |
| --- | --- |
| pnpm install --frozen-lockfile | PASS, pnpm 10.33.0 |
| Backend pełny Vitest | 159 plików PASS; 2250 testów PASS; 16 testów rzeczywistego ClickHouse pominiętych bez CLICKHOUSE_TEST_URL |
| Frontend pełny Vitest po ostatniej poprawce | 51 plików, 598 testów PASS |
| TypeScript backend/client | PASS, domyślny heap |
| Build backend/shared/tracker/precompressed assets | PASS |
| check:analytics | PASS |
| db:check + migrationLineage | PASS; nie uruchamiano migracji produkcyjnych |
| Build produkcyjny klienta | PASS, Next 16.3.6, 25 stron statycznych |
| Uruchomienie standalone client/server.js | PASS na lokalnym 127.0.0.1:3114, syntetyczne API |
| lint:wotcv i dodatkowy lint zmienionych komponentów | 0 błędów; 2 istniejące ostrzeżenia TanStack Virtual/React Compiler i 1 istniejące ostrzeżenie img w AppSidebar |
| Knip | PASS |
| Audyt polskich tłumaczeń | PASS, 2359 komunikatów; brak braków/pustych wartości/błędnych placeholderów |
| format:check:wotcv | PASS |
| Testy skryptów deploymentu | 47 testów Python PASS; bash -n PASS |
| Docs npm ci / lint:guides | PASS / 93 poradniki PASS |
| Docs agent-readiness / build / agent-http | 11 testów PASS / 5329 stron PASS / HTTP PASS |
| Portable backend pnpm deploy --legacy --prod | PASS, osobny katalog bez linków do shared w worktree |
| Importy runtime | shared, Better Auth/plugins/API key/MCP/OAuth/SSO, BullMQ, zstd, drizzle-kit/api PASS |
| Native zstd roundtrip i CLI Drizzle | PASS; drizzle-kit 0.31.9, orm 0.45.2 |
| Runtime artefakty | dist, migracje do 0020, konfiguracja, GeoIP, entrypoint i skompresowane skrypty obecne |
| Playwright Chromium | desktop 1440×1000, mobile 390×844 (~22 MB), narrow 320×844, landscape 844×390 PASS |
| Playwright WebKit | mobile 390×844 (~22 MB), wskaźnik/klawiatura w mobilnym viewporcie PASS |
| Gesty/stan UI | 4x/2x/0.5x/1x, seek przód/tył, cancel dotyku Chromium, close/reopen, resize w obie strony PASS |
| Konsola browser QA | brak pageerror i console.error w testowanych scenariuszach |
| Oględziny screenshotów | PASS po poprawieniu nakładania playera na sidebar |
| Git | brak konfliktów w indeksie, diff --check PASS; identyczne końcowe drzewa izolowanej integracji i feat/wotcv |

WebKit na Windows z mobilnym viewportem nie jest fizycznym iPhonem; nie symuluje jego limitu RAM ani wszystkich gestów Safari. Fixture o rozmiarze ~22 MB nie odwzorowuje złożoności DOM konkretnej sesji produkcyjnej.

Przy testach backendu wystąpiły także ostrzeżenia narzędzi (sourcemap node-cron, EventEmitter w środowisku mock/test), a przy przenośnym deploy ostrzeżenia peer dependencies i legacy deploy. Nie mylono ich z sukcesem pełnej weryfikacji kontenera Linux.

### 10.6. Zależności i pozostałe ryzyko bezpieczeństwa

Aktualizowano wybrane zależności w kompatybilnych zakresach, m.in. Next/eslint-config-next do 16.3.6, axios klienta 1.20.0, ip-address 10.7.2, nanoid 5.1.16, Puppeteer 24.43.1, AWS SDK 3.1138.0 i test runners w istniejących majorach. Next 16.3.6 obejmuje poprawkę krytycznego problemu optymalizatora AVIF opisanego przez autora: [GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).

Audyt rejestru z 24.09:

| Zakres | Low | Moderate | High | Critical |
| --- | ---: | ---: | ---: | ---: |
| Workspace przed dodatkowymi poprawkami | 3 | 56 | 64 | 7 |
| Workspace po poprawkach | 1 | 35 | 33 | 0 |
| Osobne docs po poprawkach | 0 | 7 | 5 | 0 |

To liczby raportu menedżera pakietów, nie liczba niezależnych luk możliwych do wykorzystania w produkcji. Zero critical nie oznacza braku problemów bezpieczeństwa. Nie zamykamy audytu jako „wszystko bezpieczne”.

Pozostały m.in.:

- przypięte Fastify 5.8.5, @fastify/static 9.1.3, lodash 4.17.21 i ua-parser-js 2.0.3;
- zależności przechodnie MCP/SSO/Drizzle, w tym ajv/fast-uri/hono, @xmldom/xmldom, starszy esbuild;
- przechodni axios Twilio, biblioteki narzędzi CSS/lint, fflate;
- backendowy Vitest 3.x, dla którego raport wskazuje poprawkę w 4.x;
- extract-zip, dla którego raport nie wskazuje wydanej poprawionej wersji.

Nie wymuszano globalnych overrides dla bibliotek uwierzytelniania ani nie zmieniano przypiętych kontraktów tylko po to, żeby wyzerować licznik. Pytanie o zgodę na osobny upgrade major @fastify/static 9→10 pozostało bez odpowiedzi. Dalsze zmiany pinów/majorów wymagają osobnej decyzji i testów kompatybilności. Pozostałe zależności przechodnie wymagają osobnego przeglądu dopuszczalnych zakresów, nie należy automatycznie klasyfikować wszystkich jako niemożliwe do zaktualizowania.

Przed wdrożeniem należy ponownie wykonać pnpm/npm audit i podjąć jawną decyzję o akceptacji lub usunięciu pozostałych ryzyk.

### 10.7. Warunki odbioru, których lokalnie nie wykonano

1. Prawdziwy build i uruchomienie obu obrazów Linux amd64/arm64 oraz effective Compose validation — na tym Windows brak dostępnego Docker CLI/daemon.
2. 16 zapytań integracyjnych do rzeczywistego testowego ClickHouse. W trybie Identity v2 wymagany jest również odpowiedni słownik; fixture upstreamu nie tworzy produkcyjnego schematu. Testy należy uruchamiać na izolowanym środowisku, nie używać produkcji jako testowego serwera.
3. Pełny eksport MP4 przy użyciu ffmpeg/Chromium z obrazu Linux i ingest end-to-end po wdrożeniu.
4. Interaktywne logowanie istniejącym kontem i Replay na rzeczywistym iPhonie: duża sesja, zmiana prędkości, przewijanie, rotacja, background/foreground.
5. Rozstrzygnięcie pozostałych zależności security z powyższej tabeli.

### 10.8. Odtworzenie walidacji i dalsza praca

Po zapoznaniu się z rozwiązanym merge użytkownik może utworzyć commit merge i wykonać push zgodnie ze swoją procedurą. Tych operacji nie wykonano automatycznie.

Główny checkout może nadal zawierać stare node_modules z npm używane przez otwarte procesy. Nie usuwano ich ani nie przerywano cudzych serwerów. Po zatrzymaniu własnych lokalnych procesów wykonać z katalogu repo:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm build:server
pnpm --filter rybbit-backend test:run --maxWorkers=4 --minWorkers=1
pnpm --filter client test:run --maxWorkers=4
pnpm --filter client typecheck
pnpm --filter client lint:wotcv
pnpm --filter client knip
pnpm --filter client audit:polish
pnpm --filter client format:check:wotcv
pnpm build:client
```

Nie uruchamiać `npm ci` w client/server/shared po migracji; npm pozostaje właściwy dla docs. W budowie lokalnego klienta ustawić właściwe `NEXT_PUBLIC_BACKEND_URL`; adres 3114 używany w QA dotyczył wyłącznie fixture, nie konfiguracji produkcyjnej.

Artefakty diagnostyczne pozostają lokalnie poza repo: `rybbit-sync-replay-qa-20260924.mjs`, screenshoty `rybbit-sync-replay-*-after.png` i izolowane katalogi testowe. Nie zawierają treści produkcyjnych sesji. Tymczasowy serwer QA zatrzymano po zakończeniu; backup/worktree pozostają do odzyskania/przeglądu, bez automatycznego kasowania.
