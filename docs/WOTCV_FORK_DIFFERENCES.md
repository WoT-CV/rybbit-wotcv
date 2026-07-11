# Różnice forka WoT-CV względem Rybbit

## Cel

Ten dokument jest źródłem prawdy o funkcjach i zmianach utrzymywanych przez WoT-CV ponad upstreamem [rybbit-io/rybbit](https://github.com/rybbit-io/rybbit). Nie opisuje kolejnych etapów implementacji; przedstawia wyłącznie aktualny stan forka.

## Strategia repozytorium

- `upstream/master` — główna gałąź oficjalnego Rybbit.
- `origin/master` — zaktualizowane odzwierciedlenie upstreamu w forku WoT-CV.
- `origin/feat/wotcv` — gałąź zmian WoT-CV używana do buildów serwerowych.
- Aktualizacje upstreamu są scalane do `master`, a następnie `master` jest scalany do `feat/wotcv`.
- Nie stosujemy force-push na gałęzi wdrożeniowej.

## Funkcje dodane przez WoT-CV

| Obszar | Różnica |
| --- | --- |
| Network Replay | Recorder fetch/XHR/Performance Resource Timing, nagłówki, body, timingi, status i wynik requestu jako eventy replay. |
| Network Replay UI | Filtry hosta, metody, statusu, initiatora i czasu; request details, correlation ID, body viewer i waterfall. |
| Replay player | Automatyczne uruchamianie sesji, segmenty aktywności, pomijanie bezczynności, rozbudowana oś czasu i bezpieczny seek. |
| Replay export | Eksport wybranego zakresu do 2 minut jako paczka diagnostyczna z replay, metadanymi i logami `api.wot-cv.com`. |
| Growth Accounting | Analiza użytkowników nowych, powracających, reaktywowanych i uśpionych dla okresów dziennych i tygodniowych. |
| Dashboards | Preset Growth Accounting możliwy do dodania do pulpitu. |
| Identity | Nazwa i awatar użytkownika na listach sesji, replay, profilu i globusie; `avatarUrl` jest kanonicznym polem logo. |
| Self-hosted | Widoczność i użycie Pages, Performance oraz Bots na instalacji self-hosted. |
| Język polski | Polska lokalizacja interfejsu bez usuwania pozostałych języków. |
| Deployment | Build z `feat/wotcv`, obrazy oznaczone SHA, health metadata, rollback i synchronizacja upstreamu. |
| AGPL-3.0 | Widoczne odnośniki do odpowiadającego kodu źródłowego, endpoint `/api/source`, nagłówki źródła i banner trackera. |

## Network Replay

### Konfiguracja per site

Tabela `sites` przechowuje `network_replay_config` jako `jsonb`. Network Replay może być aktywne wyłącznie dla strony webowej z aktywnym Session Replay.

Konfiguracja steruje:

- przechwytywaniem fetch i XHR,
- przechwytywaniem zasobów Performance API,
- nagłówkami request i response,
- body request i response,
- limitami body, eventu i batcha,
- timeoutem odczytu body.

Zmiana Session Replay na `false` wyłącza również Network Replay. Dla aplikacji mobilnej obie funkcje pozostają wyłączone.

### Format eventu

Event korzysta z pluginowego typu `rrweb/network@1`. Każdy request zawiera stabilny `requestId`, URL bieżącej strony, URL docelowy, metodę, initiator, timestamp rozpoczęcia i zakończenia, status, wynik, timingi, rozmiary, nagłówki oraz opcjonalnie body.

Obsługiwane wyniki to sukces, błąd HTTP, błąd sieci, abort, timeout oraz request oczekujący podczas zamknięcia strony.

### Prywatność i limity

Network Replay może zawierać dane wrażliwe z komunikacji aplikacji. Administrator strony odpowiada za świadomą konfigurację capture, wykluczenia i okres przechowywania. Recorder:

- nie nagrywa własnych endpointów trackera,
- ogranicza rozmiar body i całego eventu,
- nie próbuje serializować nieobsługiwanych strumieni i dużych danych binarnych,
- zachowuje informację, dlaczego body nie jest dostępne.

### UI

Panel sieciowy działa na eventach zapisanych razem z replay. Pozwala filtrować po hoście, metodzie, statusie, initiatorze, czasie i tekście. Szczegóły pokazują timingi, nagłówki, correlation ID oraz dostępne body. Waterfall i marker czasu są zsynchronizowane z odtwarzaczem.

## Odtwarzanie replay

### Aktywność

Aktywnością użytkownika są interakcje rrweb odpowiadające ruchowi myszy, kliknięciom, wpisywaniu i innym obsługiwanym incremental events. Segment aktywności rozpoczyna się 500 ms przed eventem i kończy 1000 ms po ostatnim evencie w grupie.

Starsze nagrania bez profilu aktywności korzystają z trybu zgodności. Brak eventów aktywności nie może uniemożliwić ręcznego odtwarzania.

### Autoplay i seek

Kliknięcie sesji żąda automatycznego uruchomienia wybranego replay. Seek na osi czasu, zdarzeniu lub requeście zachowuje wcześniejszy stan play/pause. Szybka zmiana sesji nie może uruchomić poprzedniej instancji playera.

### Pomijanie bezczynności

Pomijanie jest domyślnie aktywne. Aktywne fragmenty są odtwarzane z wybraną prędkością, a długie fragmenty nieaktywne są szybko przewijane. UI pokazuje stan pomijania i segmenty na osi czasu.

## Eksport replay

- Zakres jest wybierany bezpośrednio na osi czasu.
- Maksymalny zakres wynosi 2 minuty.
- Eksport zawsze pomija bezczynność i odtwarza aktywność z prędkością 1x.
- Paczka zawiera replay, metadane i logi sieciowe ograniczone do `api.wot-cv.com`.
- Zadania są kolejkowane w BullMQ, mają limit równoległości i czas wygaśnięcia.
- Pobranie i status eksportu wymagają dostępu do strony oraz właściciela zadania.

## Growth Accounting

| Stan | Definicja |
| --- | --- |
| Nowy | Użytkownik aktywny pierwszy raz w analizowanym okresie. |
| Powracający | Użytkownik aktywny w bieżącym i bezpośrednio poprzednim okresie. |
| Reaktywowany | Użytkownik aktywny obecnie, nieaktywny w poprzednim okresie, ale znany wcześniej. |
| Uśpiony | Użytkownik aktywny w poprzednim okresie, który nie wrócił w bieżącym. |

Widok Retention domyślnie korzysta z okresów dziennych. Wykres jest również dostępny jako preset karty dashboardu.

## Tożsamość i awatary

WoT-CV przekazuje identyfikator użytkownika i traits przez API trackera. `avatarUrl` jest jedynym polem obrazu. Nazwa wyświetlana może zawierać tag klanu i username. W razie braku poprawnego logo używany jest deterministyczny fallback Rybbit.

Globus pobiera dostępne dane użytkownika razem z lokalizacją sesji, aby tooltip nie wymagał dopiero ręcznego wejścia w szczegóły użytkownika.

## Funkcje self-hosted

Fork udostępnia na instalacji self-hosted ekrany Pages, Performance i Bots. Funkcje wymagają danych odpowiedniego typu:

- Performance wymaga aktywnego Web Vitals i eventów `performance`,
- Bots wymaga zapisanych zdarzeń botów,
- Pages korzysta ze standardowych eventów pageview.

Query i Dashboards pozostają dostępne zgodnie z profilem self-hosted Rybbit.

## Język polski

Polski jest dodatkowym locale. Pozostałe języki pozostają w repo i są nadal obsługiwane. Teksty UI powinny używać next-intl, a zmiany katalogów należy wykonywać przez extractor. Polecenie audytu polskiego znajduje się w `client/package.json` jako `npm run audit:polish`.

## Build i deployment

Szczegółowa procedura znajduje się w [WOTCV_FORK_DEPLOYMENT.md](WOTCV_FORK_DEPLOYMENT.md).

Build przekazuje:

- `WOTCV_GIT_SHA`,
- `WOTCV_IMAGE_TAG`,
- `WOTCV_BUILD_TIME`,
- `WOTCV_DEPLOYED_AT`.

Backend zwraca te dane w `/api/health`. Projekt Compose zachowuje nazwę `rybbit`, aby korzystać z istniejących wolumenów Postgresa, ClickHouse i Redis.

## Zgodność AGPL-3.0

Fork zachowuje `LICENSE.md` i `NOTICE.md`. Uruchomiona aplikacja wskazuje odpowiadający kod źródłowy:

- przez UI klienta,
- przez `/api/source`,
- przez nagłówki `Link` i `X-Source-Code`,
- przez banner w `script.js` i `script-full.js`.

Repozytorium i wskazane SHA muszą pozostać publicznie dostępne. Sekrety, `.env` i dane użytkowników nie są częścią Corresponding Source.

## Pliki o wysokim ryzyku konfliktu

- `server/src/analytics-script/sessionReplay.ts`
- `server/src/analytics-script/config.ts`
- `server/src/index.ts`
- `server/src/db/postgres/schema.ts`
- `client/src/components/replay/**`
- `client/src/app/[site]/components/Sidebar/Sidebar.tsx`
- `client/messages/*.json`
- `client/Dockerfile`
- `server/Dockerfile`
- `docker-compose.yml`

### Zasady rozwiązywania konfliktów

1. Zachować kontrakty i nowe pola z upstreamu, a następnie ponownie nałożyć rozszerzenia WoT-CV zamiast przywracać całe stare pliki.
2. Dla `shared` oraz schematu Postgresa najpierw uzgodnić typy i nazwy kolumn; dopiero potem poprawiać klienta, API i tracker.
3. W trackerze zachować aktualny lifecycle Session Replay z upstreamu oraz dołączyć recorder `rrweb/network@1` przez istniejące punkty rozszerzeń.
4. W playerze zachować API rrweb używane przez aktualny upstream i dostosować `ReplayPlayerAdapter`, nie omijać adaptera bezpośrednimi wywołaniami.
5. Katalogów językowych nie scalać ręcznie blokami. Najpierw rozwiązać komunikaty źródłowe, potem uruchomić extractor i uzupełnić wyłącznie nowe polskie wartości.
6. W Dockerfile i Compose zachować wersje bazowe upstreamu, ale nie usuwać metadanych OCI, niezmiennych tagów SHA ani nazw istniejących wolumenów.
7. Nie akceptować konfliktu przez `ours` dla całego katalogu. Każdy hotspot wymaga przeglądu różnic funkcjonalnych.

## Checklista po merge z upstreamem

1. Zbudować `shared`, klienta, serwer i tracker.
2. Uruchomić testy konfiguracji trackera i ingest replay.
3. Zweryfikować schema Drizzle przez `npm run db:check` bez uruchamiania migracji.
4. Sprawdzić Session Replay, Network Replay, autoplay, seek i pomijanie bezczynności.
5. Wykonać eksport i sprawdzić zawartość paczki.
6. Sprawdzić Growth Accounting dziennie i tygodniowo.
7. Otworzyć Pages, Performance i Bots na self-hosted.
8. Uruchomić audyt polskich tłumaczeń.
9. Sprawdzić `/api/health`, `/api/source` i banner trackera.
10. Zweryfikować Compose i nazwy istniejących wolumenów.
11. Porównać `git diff upstream/master...feat/wotcv` z tabelą funkcji w tym dokumencie.
12. Dopiero po pełnej walidacji pushować `master` i `feat/wotcv`.
