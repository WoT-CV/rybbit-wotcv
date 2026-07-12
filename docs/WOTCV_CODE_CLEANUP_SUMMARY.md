# Podsumowanie sprzątania forka Rybbit WoT-CV

## Status dokumentu

Ten dokument podsumowuje zakończone sprzątanie zmian WoT-CV na gałęzi `feat/wotcv`.

- Dokument jest raportem roboczym po zakończeniu implementacji.
- Zgodnie z ustaleniem nie jest częścią commitów sprzątania.
- Stabilny commit kończący sprzątanie: `071824571ee3d04422ba1fdc7c7472e1014c45c6`.
- Commit naprawiający budowanie klienta w Dockerze: `0ce3aa1e`.
- Baseline przed sprzątaniem: `90499f0625f6a7dcc5a82073f1fd4eb0ae4ef10d`.
- Łączny zakres: 111 plików, 3952 dodane i 3959 usunięte linie.
- Nie uruchamiano migracji ani poleceń zmieniających dane w bazie.

## Cel sprzątania

Sprzątanie miało uporządkować funkcje dodane przez WoT-CV bez przepisywania niezwiązanego kodu upstream Rybbit. Główne cele obejmowały:

1. zachowanie dotychczasowych funkcji Network Replay i odtwarzacza,
2. usunięcie duplikacji kontraktów między klientem, serwerem i trackerem,
3. ujednolicenie algorytmu aktywności używanego przez odtwarzacz i eksport,
4. uproszczenie eksportu replay,
5. ustabilizowanie Growth Accounting,
6. ujednolicenie tożsamości użytkownika i awatarów,
7. jawne udostępnienie funkcji analitycznych na self-hosted,
8. utrzymanie pełnego katalogu języka polskiego bez usuwania innych języków,
9. uproszczenie buildów, deploymentu i synchronizacji z upstreamem,
10. dodanie bramek jakości ograniczonych do kodu utrzymywanego przez WoT-CV,
11. potwierdzenie zgodności operacyjnej z AGPL-3.0,
12. usunięcie dokumentów etapowych po przeniesieniu aktualnej wiedzy do dwóch dokumentów stałych.

## Stan końcowy dokumentacji

Po sprzątaniu utrzymywane są dwa dokumenty operacyjne:

- `docs/WOTCV_FORK_DIFFERENCES.md` — funkcjonalne i techniczne różnice względem upstream Rybbit,
- `docs/WOTCV_FORK_DEPLOYMENT.md` — wdrożenie, aktualizacja, smoke testy, rollback i synchronizacja upstreamu.

Usunięto dokumenty, które opisywały zakończone plany, audyty pośrednie lub historyczny rollout:

- `WOTCV_NETWORK_REPLAY_COMPLETION_AUDIT.md`,
- `WOTCV_NETWORK_REPLAY_IMPLEMENTATION_PLAN.md`,
- `WOTCV_NETWORK_REPLAY_ROLLOUT.md`,
- `WOTCV_POLISH_TRANSLATION_QA.md`,
- `WOTCV_REPLAY_AND_GROWTH_ACCOUNTING_PLAN.md`,
- `WOTCV_REPLAY_AND_GROWTH_ACCOUNTING_VALIDATION.md`,
- `WOTCV_REPLAY_UI_ENHANCEMENTS_PLAN.md`,
- `WOTCV_CODE_CLEANUP_PLAN.md`.

## Lista etapów i commitów

| Etap | Commit | Zakres |
| --- | --- | --- |
| 0 | `e42d6510` | Zapis baseline sprzątania |
| 1 | `825ffbb8` | Konsolidacja dokumentacji forka |
| 2 | `b63f17ea` | Centralizacja konfiguracji i limitów WoT-CV |
| 3 | `730971e9` | Wspólny kontrakt Network Replay |
| 4 | `a74afafa` | Izolacja reguł konfiguracji replay per site |
| 5 | `f3d52b40` | Uproszczenie cyklu życia recordera |
| 6 | `02c6b2f9` | Stabilizacja batchingu i ponowień replay |
| 7 | `d945f3b4` | Rozdzielenie parsera sieci od prezentacji |
| 8 | `4da8cced` | Typowany adapter rrweb |
| 9 | `90cf2314` | Deterministyczny wybór sesji i autoplay |
| 10 | `f470968c` | Wspólna segmentacja aktywności i bezczynności |
| 11 | `3fa3990c` | Uproszczenie timeline i wyboru eksportu |
| 12 | `cca4ad8d` | Uproszczenie kontraktu i renderera eksportu |
| 13 | `53c60f25` | Stabilizacja Growth Accounting |
| 14 | `750562f9` | Ujednolicenie identity i awatarów |
| 15 | `f06ab438` | Capability flags dla self-hosted |
| 16 | `1da578a5` | Deterministyczny audyt tłumaczenia polskiego |
| 17 | `3924a4e1` | Konsolidacja skryptów operacyjnych |
| 18 | `f7baaf6e` | Reprodukowalne artefakty i metadane buildów |
| 19 | `8f6f8a3c` | Weryfikacja dostępności źródeł AGPL |
| 20 | `81e2d492` | Statyczna analiza kodu forka |
| 21 | `302f0bb6` | Testy regresyjne funkcji WoT-CV |
| 22 | `11ccaedd` | Procedura synchronizacji z upstreamem |
| Docker | `0ce3aa1e` | Naprawa lokalnego pakietu shared w obrazie klienta |
| 23 | `07182457` | Audyt końcowy i zamknięcie sprzątania |

## Wspólne kontrakty

### Network Replay

Kontrakt danych został przeniesiony do pakietu `@rybbit/shared`. Klient i serwer nie utrzymują już niezależnych kopii tych samych typów.

Współdzielone elementy obejmują:

- wersję schematu Network Replay,
- typy żądania i odpowiedzi,
- typy nagłówków oraz przechwyconych body,
- konfigurację rejestrowania ruchu,
- limity eksportu,
- host logów eksportowanych do zgłoszeń,
- kontrakty aktywności replay,
- model Growth Accounting.

Efekt utrzymaniowy: zmiana formatu lub limitu wymaga aktualizacji jednego źródła kontraktu, a nie ręcznej synchronizacji kilku modułów.

### Konfiguracja site

Walidacja i normalizacja `networkReplayConfig` zostały wydzielone z dużego endpointu aktualizacji strony. Serwer:

- zachowuje bezpieczne wartości domyślne,
- normalizuje hosty i limity,
- nie zapisuje przypadkowych pól spoza kontraktu,
- zwraca spójny model niezależnie od częściowej konfiguracji wejściowej.

Nie zmieniano istniejącej migracji produkcyjnej ani nie wykonywano migracji podczas sprzątania.

## Tracker i rejestrowanie danych

### Cykl życia recordera

Obsługa recordera Network Replay została wyodrębniona do małego modułu odpowiedzialnego za:

- utworzenie instancji,
- bezpieczne zatrzymanie poprzedniej instancji,
- zmianę konfiguracji,
- cleanup przy wyłączeniu funkcji,
- zapobieganie wielokrotnemu aktywowaniu interceptorów.

### Batching i ponowienia

Logika batchingu replay została wydzielona do testowalnego modułu. Kolejka zachowuje dane po błędzie transportu i ponawia wysłanie bez utraty kolejności.

### Artefakty analityczne

Dodano kontrolę zgodności źródeł trackera z `server/public/script.js` i `server/public/script-full.js`.

- `npm run check:analytics` buduje artefakty i sprawdza, czy repozytorium zawiera aktualny wynik.
- Build backendu nadal generuje oba warianty skryptu.
- Obraz backendu otrzymuje metadane rewizji, czasu i tagu.

## Parser i interfejs Network Replay

Parser eventów rrweb nie renderuje już elementów React. Zwraca typowane dane domenowe używane przez osobne komponenty prezentacyjne.

Utrzymane funkcje obejmują:

- filtrowanie po metodzie HTTP,
- filtrowanie po statusie,
- filtrowanie po inicjatorze,
- filtrowanie po czasie trwania,
- filtrowanie po hoście,
- tryb Fetch/XHR,
- wyszukiwanie tekstowe,
- correlation ID z nagłówków odpowiedzi,
- rozmiar transferu z Performance API z fallbackiem do `content-length`,
- szczegóły URL, nagłówków, treści i czasów.

Parser odrzuca nieobsługiwane wersje schematu zamiast interpretować je jako bieżący format.

## Odtwarzacz replay

### Adapter rrweb

Bezpośrednie, luźno typowane wywołania rrweb zostały zamknięte w `ReplayPlayerAdapter`. Adapter zapewnia jedno miejsce dla:

- `play`,
- `pause`,
- `goto`,
- prędkości odtwarzania,
- czasu bieżącego,
- stanu odtwarzacza,
- eventów sterujących.

Zmniejsza to ryzyko regresji po aktualizacji rrweb i usuwa rozproszone rzutowania typów.

### Autoplay i wybór sesji

Wybór replay z listy uruchamia odtwarzanie automatycznie. Seek zachowuje informację, czy replay był uruchomiony przed zmianą czasu:

- aktywny replay wraca do odtwarzania,
- zatrzymany replay pozostaje zatrzymany,
- przełączenie sesji resetuje stan zależny od poprzedniego nagrania,
- nie są wymagane arbitralne timeouty do rozpoczęcia odtwarzania.

### Aktywność i bezczynność

Definicja aktywności jest współdzielona przez klienta i renderer eksportu. Aktywność obejmuje ruch myszy, kliknięcia i wejście z klawiatury. Okna aktywności uwzględniają ustalone bufory przed i po zdarzeniu.

Wynik segmentacji zawiera:

- okresy aktywności,
- okresy bezczynności,
- granice używane przez seek,
- profil przechwytywania starszych i nowszych nagrań.

Pomijanie bezczynności wykonuje skok do następnego aktywnego fragmentu, zamiast odtwarzać bezczynność z wysoką prędkością.

### Timeline

Obliczenia pozycji timeline i przesuwanego zakresu eksportu znajdują się w czystych funkcjach. Główny timeline i zakres eksportu:

- mają wspólną szerokość,
- korzystają z tych samych jednostek czasu,
- pozwalają przesuwać maksymalny zakres bez blokowania końcowego uchwytu,
- zachowują długość zaznaczenia, dopóki nie osiągną granicy nagrania.

## Eksport replay

Eksport został ograniczony do danych potrzebnych do zgłoszenia problemu:

1. nagranie WebM,
2. metadane,
3. logi sieciowe wyłącznie dla `api.wot-cv.com`.

Usunięto zbędne opcje interfejsu i kontraktu API, w tym osobne sterowanie treścią request/response, zrzutem diagnostycznym i prędkością filmu.

Aktualne zasady:

- maksymalny zakres eksportu pochodzi ze wspólnej stałej,
- bezczynność jest zawsze pomijana,
- film jest renderowany w prędkości 1x,
- renderer i player używają tej samej segmentacji aktywności,
- schema requestu eksportu jest walidowana przez Zod,
- pliki wynikowe mają przewidywalne nazwy i minimalny zestaw załączników.

## Growth Accounting

Model rozróżnia:

- nowych użytkowników,
- powracających użytkowników,
- reaktywowanych użytkowników,
- uśpionych użytkowników.

Typy są współdzielone, a API ma testy dla agregacji dziennej i tygodniowej. Widok retencji domyślnie używa agregacji dziennej. Legenda opisuje znaczenie każdego stanu, a tooltip jest ograniczony do obszaru wykresu.

Karta Growth Accounting pozostaje dostępna do użycia na pulpitach.

## Tożsamość użytkownika i awatary

Ujednolicono sposób wyboru nazwy i grafiki użytkownika w Users, Replay, Globe i szczegółach użytkownika.

- `avatarUrl` jest kanonicznym polem grafiki.
- Nie jest wymagane dublowanie grafiki w `clanLogoUrl`.
- Identyfikatory użytkownika i klienta pozostają rozdzielone semantycznie.
- Brak grafiki korzysta z deterministycznego awatara zastępczego.
- Błędny URL grafiki nie powoduje zapętlenia renderowania.
- Globe wyświetla znaną tożsamość bez czekania na przejście do szczegółów.

## Self-hosted i capabilities

Warunki widoczności funkcji nie opierają się już na rozproszonych sprawdzeniach `isCloud`. Dodano jawny model capabilities.

Dla wspieranej instalacji self-hosted dostępne są między innymi:

- Strony,
- Wydajność,
- Boty,
- Network Replay,
- Growth Accounting,
- pozostałe ekrany objęte capability flags.

Model capabilities pozwala odróżnić dostępność funkcji od sposobu wdrożenia i ogranicza ryzyko ponownego ukrycia ekranów podczas merge z upstreamem.

## Język polski

Polski pozostaje dodatkowym językiem; inne katalogi nie zostały usunięte.

Audyt `npm run audit:polish` sprawdza:

- brakujące klucze,
- nadmiarowe klucze,
- puste tłumaczenia,
- niezgodne placeholdery,
- wartości identyczne z angielskim wymagające przeglądu.

Stan końcowy audytu:

- 2058 komunikatów,
- 0 brakujących kluczy,
- 0 nadmiarowych kluczy,
- 0 pustych tłumaczeń,
- 0 niezgodnych placeholderów,
- 0 identycznych wartości wymagających przeglądu.

## Deployment i operacje

### Skrypty utrzymywane po sprzątaniu

- `scripts/update_rybbit_wotcv.sh` — wrapper aktualizacji,
- `scripts/wotcv-branch-build-deploy.sh` — pull, build i restart z `feat/wotcv`,
- `scripts/wotcv-deploy.sh` — wdrożenie obrazów,
- `scripts/wotcv-smoke.sh` — wspólny smoke test,
- `scripts/wotcv-server-audit.sh` — audyt konfiguracji serwera,
- `scripts/wotcv-sync-upstream-master.sh` — aktualizacja mastera i opcjonalny merge do feature brancha,
- `scripts/lib/wotcv-common.sh` — współdzielone funkcje shellowe.

Usunięto skrypty dublujące odpowiedzialności, w tym dawny `wotcv-pull-build-restart.sh` i osobne smoke testy pojedynczych funkcji.

### Zasady uruchamiania

- Repozytorium i narzędzia powinny należeć do użytkownika `wotcv`.
- Aktualizacji nie należy wykonywać przez `sudo`, ponieważ root ponownie zmieni właściciela plików `.git`, logów i locka.
- Wrapper w `/home/wotcv/tools` powinien wywoływać skrypt z repozytorium, a nie zawierać jego skopiowaną logikę.
- Lock aktualizacji zapobiega równoległemu wdrożeniu.
- Log aktualizacji jest zapisywany poza repozytorium.

### Synchronizacja upstream

Skrypt synchronizacji:

- pobiera `upstream/master`,
- aktualizuje lokalny `master`,
- tworzy gałąź zapasową,
- opcjonalnie scala master do `feat/wotcv`,
- nie wykonuje force-push,
- pokazuje rozbieżność przed i po operacji.

Dokument różnic zawiera listę plików o wysokim ryzyku konfliktu oraz zasady rozwiązywania konfliktów semantycznych.

## Naprawa builda klienta w Dockerze

Po dodaniu bezpośrednich importów z `@rybbit/shared` build serwerowy ujawnił problem z lokalną zależnością `file:../shared`.

Przyczyna:

1. `npm ci` tworzył `node_modules/@rybbit/shared` jako link do `../shared`,
2. `node_modules` był kopiowany do kolejnego etapu obrazu,
3. link po zmianie granicy etapu nie wskazywał na poprawny pakiet,
4. Turbopack zgłaszał `Can't resolve '@rybbit/shared'`.

Naprawa w `0ce3aa1e`:

- po `npm ci` link jest zastępowany rzeczywistym katalogiem pakietu,
- do pakietu kopiowane są `package.json` i zbudowany `dist`,
- Next ma `transpilePackages` dla `@rybbit/shared`,
- Turbopack otrzymuje root repozytorium oraz alias do współdzielonego źródła podczas lokalnego builda.

Lokalny produkcyjny build Next.js przeszedł. Lokalne środowisko nie ma polecenia Docker, dlatego pełny build obrazu należy potwierdzić na Ubuntu po wypchnięciu commitów.

## Reprodukowalność i metadane

Obrazy klienta i backendu otrzymują:

- SHA commita,
- tag obrazu,
- czas builda,
- źródło repozytorium,
- oznaczenie licencji.

Endpoint `/api/health` pozwala potwierdzić wdrożoną rewizję. Compose zachowuje nazwę projektu `rybbit`, aby korzystać z istniejących wolumenów Postgresa, ClickHouse i Redis.

## AGPL-3.0

Sprzątanie zachowuje obowiązki forka:

- `LICENSE.md` pozostaje w repozytorium,
- `NOTICE.md` opisuje modyfikacje WoT-CV,
- interfejs zawiera odnośnik do odpowiadającego kodu źródłowego,
- obrazy zawierają etykietę licencji i rewizji,
- test źródła sprawdza dostępność strony source code,
- wdrożona rewizja jest widoczna przez health endpoint.

Ten raport nie stanowi porady prawnej. Dokumentuje techniczne mechanizmy ułatwiające spełnienie obowiązku udostępnienia odpowiadającego kodu źródłowego.

## Bramki jakości

### Klient

| Komenda | Wynik |
| --- | --- |
| `npm run test:run` | 5 plików, 13 testów zaliczonych |
| `npm run lint:wotcv` | 0 błędów, 2 ostrzeżenia TanStack Virtual |
| `npm run knip` | brak problemów w granicy forka |
| `npm run audit:polish` | katalog PL kompletny |
| `npm run format:check:wotcv` | wszystkie pliki zgodne |
| `npx tsc --noEmit` | zaliczone |
| `npm run build` | produkcyjny build Next.js zaliczony |

### Serwer

| Komenda | Wynik |
| --- | --- |
| `npm run test:run` | 33 pliki, 334 testy zaliczone |
| `npm run db:check` | schema poprawna; bez migracji |
| `npm run check:analytics` | oba bundle trackera aktualne |
| `npm run build` | TypeScript i tracker zbudowane |

### Shared i operacje

| Kontrola | Wynik |
| --- | --- |
| `shared: npm run build` | zaliczone |
| `bash -n` dla `scripts/**/*.sh` | zaliczone |
| `git diff --check` | zaliczone |
| martwe odnośniki do usuniętych dokumentów | nie znaleziono |
| lokalny Docker Compose | niewykonany; Docker niedostępny lokalnie |

## Znane ostrzeżenia nieblokujące

1. ESLint zgłasza dwa ostrzeżenia React Compiler dla `useVirtualizer` w breadcrumbach i timeline sieciowym. Są to ograniczenia integracji TanStack Virtual, nie błędy runtime.
2. Vitest serwera ostrzega, że `environmentMatchGlobs` jest przestarzałe. To konfiguracja upstream i może zostać przeniesiona do `test.projects` w osobnej zmianie.
3. Pełny lint i pełny format całego klienta nadal obejmują historyczny dług upstreamu. Fork ma zawężone bramki, aby nie mieszać sprzątania WoT-CV z masowym formatowaniem Rybbit.
4. Pełny build obrazu Docker musi zostać potwierdzony na Ubuntu, ponieważ lokalne środowisko nie udostępnia Dockera.

## Instrukcja wdrożenia po sprzątaniu

Po wypchnięciu commitów do `origin/feat/wotcv` na serwerze należy wykonać aktualizację jako użytkownik `wotcv`, bez `sudo`:

```bash
/home/wotcv/tools/update_rybbit_wotcv.sh
```

Jeżeli repozytorium lub katalog narzędzi ma błędnego właściciela, jednorazowa naprawa to:

```bash
sudo chown -R wotcv:wotcv /home/rybbit-wotcv /home/wotcv/tools
sudo rm -f /tmp/rybbit-wotcv-update.lock
```

Następnie ponownie uruchomić wrapper już bez `sudo`.

Po wdrożeniu sprawdzić:

```bash
curl -fsS https://tracking.wot-cv.com/api/health

cd /home/rybbit-wotcv
docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  ps

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  logs --since=10m backend client
```

Health powinien wskazywać SHA zawierające co najmniej commit `0ce3aa1e`, a docelowo commit końcowy `07182457` lub późniejszy.

## Rollback

W przypadku problemu po wdrożeniu:

1. zachować log aktualizacji,
2. wskazać poprzedni poprawny SHA,
3. przełączyć repozytorium na poprzedni commit lub użyć poprzednich obrazów,
4. uruchomić Compose z tym samym `COMPOSE_PROJECT_NAME=rybbit`,
5. nie usuwać wolumenów,
6. potwierdzić `/api/health`,
7. dopiero potem analizować nowy build poza produkcyjnym procesem.

Zmiany sprzątania nie wymagają resetowania Postgresa, ClickHouse ani Redis.

## Zalecenia utrzymaniowe

1. Każdą zmianę formatu replay zaczynać od `shared/src/networkReplay.ts`.
2. Każdą zmianę definicji aktywności zaczynać od `shared/src/replayActivity.ts`.
3. Nie dodawać osobnej implementacji segmentacji do klienta lub renderera eksportu.
4. Utrzymywać parser eventów niezależnie od komponentów React.
5. Nie omijać `ReplayPlayerAdapter` bez uzasadnienia zgodnością z nową wersją rrweb.
6. Dodawać test przy każdej zmianie limitu, wersji schematu lub reguły filtrowania.
7. Uruchamiać `npm run check:analytics` po każdej zmianie trackera.
8. Nie modyfikować wygenerowanych bundle bez zmiany źródła.
9. Nie wykonywać migracji w ramach builda lub audytu kodu.
10. Po merge upstream zawsze sprawdzić capability flags, Sidebar, tracker config, replay store i Dockerfile.
11. Aktualizować `WOTCV_FORK_DIFFERENCES.md`, gdy zmienia się zachowanie produktu.
12. Aktualizować `WOTCV_FORK_DEPLOYMENT.md`, gdy zmienia się procedura serwerowa.
13. Nie przywracać dokumentów etapowych; historia implementacji pozostaje w commitach.
14. Przed publikacją obrazu wykonywać całą macierz workflow `build-wotcv-images.yml`.

## Definition of Done — wynik

- [x] Jeden aktualny dokument różnic forka.
- [x] Jeden aktualny runbook wdrożeniowy.
- [x] Usunięte dokumenty etapowe.
- [x] Jeden kontrakt Network Replay.
- [x] Jedna konfiguracja domyślna Network Replay.
- [x] Wspólna segmentacja aktywności playera i eksportu.
- [x] Typowany adapter rrweb.
- [x] Deterministyczny autoplay i seek.
- [x] Uproszczony kontrakt eksportu.
- [x] Centralny limit eksportu i host logów.
- [x] Testy Growth Accounting day/week.
- [x] Spójne identity i awatary.
- [x] Capability flags dla self-hosted.
- [x] Audyt języka polskiego jako bramka.
- [x] Skonsolidowane skrypty operacyjne.
- [x] Reprodukowalne artefakty trackera.
- [x] Metadane rewizji w obrazach i health endpoint.
- [x] Mechanizmy dostępności źródeł AGPL.
- [x] Testy regresyjne klienta i serwera.
- [x] Dokumentowana synchronizacja z upstreamem.
- [x] Końcowy diff-check i kontrola martwych odnośników.
- [ ] Pełny build obrazu na Ubuntu po wypchnięciu najnowszych commitów.

## Podsumowanie

Sprzątanie zachowało funkcje wdrożone dla WoT-CV, ale przeniosło ich reguły do mniejszych, typowanych i testowalnych modułów. Największa redukcja ryzyka dotyczy kontraktów Network Replay, sterowania rrweb, segmentacji aktywności, eksportu, visibility self-hosted oraz procesu wdrożeniowego.

Kod jest gotowy do ponownego builda na Ubuntu. Ostatnim operacyjnym krokiem jest wypchnięcie lokalnych commitów i uruchomienie wrappera aktualizacji bez `sudo`.
