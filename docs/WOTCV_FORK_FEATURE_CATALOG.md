# Katalog funkcjonalności forka Rybbit WoT-CV

## Cel dokumentu

Ten dokument opisuje wszystkie funkcjonalne zmiany wprowadzone od rozpoczęcia forka WoT-CV względem zsynchronizowanej gałęzi `origin/master` projektu Rybbit. Obejmuje zarówno funkcje dodane przez fork, jak i funkcje upstreamu, które zostały odblokowane lub dostosowane do działania na instalacji self-hosted.

Dokument nie jest instrukcją wdrożeniową. Konfiguracja serwera i procedura aktualizacji znajdują się w [WOTCV_FORK_DEPLOYMENT.md](WOTCV_FORK_DEPLOYMENT.md), a skrócone zestawienie różnic w [WOTCV_FORK_DIFFERENCES.md](WOTCV_FORK_DIFFERENCES.md).

## Zakres audytu

Katalog przygotowano na podstawie:

- 96 commitów gałęzi `feat/wotcv` ponad `origin/master`,
- historii commitów autora Daniel Owczarczyk od 10 lipca 2026,
- diffu obejmującego klienta, backend, tracker, pakiet `shared`, Docker Compose, workflow CI i skrypty wdrożeniowe,
- aktualnego stanu working tree, w tym warunkowych capabilities self-hosted niewymagających ustawienia `CLOUD=true`.

Stan opisany w dokumencie odpowiada kodowi forka z 12 lipca 2026.

## Legenda dostępności

| Status | Znaczenie |
| --- | --- |
| Dostępne | Funkcja działa na self-hosted bez zewnętrznej usługi. |
| Konfigurowalne | Funkcja pojawia się i uruchamia dopiero po podaniu kompletnej konfiguracji. |
| Zależne od danych | UI jest dostępne, ale wymaga zebrania odpowiednich typów eventów. |
| Cloud-only | Funkcja świadomie pozostaje powiązana z komercyjną infrastrukturą Rybbit Cloud. |

## Podsumowanie funkcji odblokowanych z `IS_CLOUD`

| Funkcja | Zachowanie przed zmianami WoT-CV | Aktualne zachowanie self-hosted |
| --- | --- | --- |
| Strony / Pages | Pozycja menu i ekran zależały od profilu cloud. | Dostępne przez capability `pageAnalytics`. |
| Wydajność / Performance | Pozycja menu i ekran były ukryte. | Dostępne przez `performanceAnalytics`; wymagają danych Web Vitals. |
| Boty | Pozycja menu i ekran były ukryte. | Dostępne przez `botAnalytics`; wymagają danych botów. |
| Web Vitals | Przełącznik był ukryty przy tworzeniu strony i w ustawieniach. | Widoczny dla stron webowych bez wymogu cloud. |
| Eksport PDF | UI wymagało komercyjnego planu, którego self-hosted nie posiada. | Dostępny bez planu; backend nadal sprawdza plany tylko w cloud. |
| Google Search Console | Integracje i karta główna były renderowane wyłącznie w cloud. | Widoczne po wykryciu kompletnej konfiguracji Google OAuth. |
| Logowanie Google | Przyciski social login były całkowicie ukryte poza cloud. | Widoczne po ustawieniu klienta i sekretu Google. |
| Logowanie GitHub | Przyciski social login były całkowicie ukryte poza cloud. | Widoczne po ustawieniu klienta i sekretu GitHub. |
| Reset hasła | Link był ukryty poza cloud, a provider e-mail nie był inicjalizowany. | Link i wysyłka OTP działają po skonfigurowaniu Resend. |
| Zaproszenia do organizacji | Self-hosted oferował tylko bezpośrednie tworzenie konta. | E-mailowe zaproszenia są dostępne po skonfigurowaniu Resend. |
| Raporty tygodniowe | Przełącznik i cron działały tylko w cloud. | Dostępne po Resend i jawnym `ENABLE_WEEKLY_REPORTS=true`. |
| Cloudflare Turnstile | Backend i formularze używały captchy tylko w cloud. | Działa na self-hosted po ustawieniu obu kluczy. |
| Cloudflare R2 | Klient storage inicjalizował się tylko przy `IS_CLOUD=true`. | Inicjalizuje się po wykryciu kompletu credentiali R2. |
| Twilio SMS | Klient Twilio inicjalizował się tylko w cloud. | Inicjalizuje się po wykryciu credentiali Twilio. |
| Atrybucja GeoIP | Tooltip źródła geolokalizacji był ukryty poza cloud. | Informacja o MaxMind jest widoczna również na self-hosted. |

Żadna z tych zmian nie wymaga globalnego `CLOUD=true`. Funkcje komercyjne pozostają oddzielone od bezpiecznych capabilities self-hosted.

## Chronologia rozwoju forka

| Etap | Najważniejsze rezultaty |
| --- | --- |
| Network Replay — fundament | Konfiguracja per strona, kontrakt `rrweb/network@1`, recorder fetch/XHR/Performance Resource Timing oraz limity prywatności. |
| Network Replay — interfejs | Lista requestów, filtry, szczegóły, waterfall, body viewer, hosty, correlation ID i synchronizacja z czasem replay. |
| Deployment forka | Build z `feat/wotcv`, niezmienne tagi SHA, metadane health, rollback i wrapper aktualizacyjny. |
| Identity i globus | Nazwy użytkowników, logo/awatary klanów oraz dane użytkownika w tooltipach globusa. |
| Self-hosted analytics | Udostępnienie Pages, Performance i Bots oraz uporządkowanie capabilities analitycznych. |
| Polski interfejs | Pełne tłumaczenie głównych powierzchni produktu i automatyczny audyt katalogu PL. |
| Replay jak PostHog | Deterministyczny autoplay, seek zachowujący stan, segmenty aktywności, pomijanie bezczynności i wielowarstwowa oś czasu. |
| Growth Accounting | Backend, wykres retencji, tryb dzienny/tygodniowy i karta do własnego dashboardu. |
| Eksport replay | Eksport zaznaczonego zakresu jako paczka diagnostyczna gotowa do zgłoszenia problemu. |
| Zgodność AGPL | Linki do odpowiadającego kodu źródłowego, endpoint źródła, nagłówki i banner trackera. |
| Stabilizacja | Wspólne kontrakty `shared`, adapter rrweb, testy regresji, bramki jakości i uproszczenie deploymentu. |
| Rozszerzenia self-hosted | PDF, Web Vitals, GSC, OAuth, e-mail, Turnstile, R2 i Twilio bez globalnego włączania trybu cloud. |

---

# 1. Network Replay

## 1.1. Konfiguracja per strona

Network Replay jest rozszerzeniem Session Replay. Nie można go włączyć dla aplikacji mobilnej ani dla strony z wyłączonym Session Replay.

| Opcja | Wartość domyślna | Działanie |
| --- | --- | --- |
| `enabled` | `false` | Główny przełącznik nagrywania ruchu sieciowego. |
| `captureFetch` | `true` | Rejestruje requesty wykonywane przez `fetch`. |
| `captureXhr` | `true` | Rejestruje requesty `XMLHttpRequest`. |
| `capturePerformanceResources` | `true` | Łączy requesty z Resource Timing API. |
| `captureInitialPerformanceResources` | `true` | Rejestruje zasoby obecne przed startem obserwatora. |
| `captureRequestHeaders` | `true` | Zapisuje dostępne nagłówki żądania. |
| `captureResponseHeaders` | `true` | Zapisuje dostępne nagłówki odpowiedzi. |
| `captureRequestBody` | `true` | Zapisuje wspierane body żądania. |
| `captureResponseBody` | `true` | Zapisuje wspierane body odpowiedzi. |
| `maxBodySizeBytes` | 1 000 000 B | Maksymalny rozmiar pojedynczego body. |
| `bodyReadTimeoutMs` | 1 000 ms | Limit czasu odczytu body. |
| `maxNetworkEventSizeBytes` | 2 500 000 B | Maksymalny rozmiar eventu sieciowego. |
| `maxReplayBatchSizeBytes` | 7 000 000 B | Maksymalny rozmiar batcha replay. |

Konfiguracja jest normalizowana po stronie backendu. Wyłączenie Session Replay automatycznie wyłącza Network Replay.

## 1.2. Rejestrowane dane requestu

Każdy event `rrweb/network@1` może zawierać:

- wersję schematu,
- stabilny `requestId`,
- URL bieżącej strony i URL docelowy,
- metodę HTTP oraz typ initiatora,
- czas rozpoczęcia, zakończenia i czas trwania,
- status oraz tekst statusu,
- wynik requestu,
- nagłówki żądania i odpowiedzi,
- body żądania i odpowiedzi,
- dane Resource Timing,
- rozmiar transferu oraz rozmiar body encoded/decoded,
- błąd z nazwą, komunikatem i stackiem,
- informację, czy dopasowano wpis Performance API.

Obsługiwane wyniki:

- `success`,
- `http_error`,
- `network_error`,
- `aborted`,
- `timeout`,
- `pending_on_unload`.

## 1.3. Obsługa body

Recorder rozpoznaje m.in. tekst, JSON, `FormData`, `URLSearchParams`, Blob i ArrayBuffer. Strumienie, dane binarne, przekroczone limity i timeouty są oznaczane metadanymi zamiast powodować błąd całego replay.

Tracker nie nagrywa własnych endpointów analitycznych, ogranicza rozmiary danych i zachowuje powód niedostępności body.

## 1.4. Panel sieciowy replay

Panel `Sieć` udostępnia:

- wyszukiwanie tekstowe,
- filtrowanie po hoście docelowym,
- filtrowanie po metodzie HTTP,
- filtrowanie po grupie statusu,
- filtrowanie po initiatorze,
- minimalny czas trwania requestu,
- tryb „Tylko Fetch/XHR”,
- tryb śledzenia bieżącego czasu replay,
- licznik widocznych i wszystkich requestów,
- wybór requestu i przejście do jego czasu w nagraniu.

## 1.5. Szczegóły requestu

Widok szczegółów zawiera:

- zakładkę przeglądu,
- pełny URL i URL bieżącej strony,
- metodę, status, wynik i initiator,
- czas rozpoczęcia, zakończenia i czas trwania,
- ID żądania,
- `correlation-id` odczytany z nagłówków odpowiedzi,
- rozmiar transferu,
- wpis Performance Resource Timing,
- szczegółowe timingi DNS, connect, TLS, request i response,
- nagłówki requestu,
- nagłówki odpowiedzi,
- body requestu,
- body odpowiedzi.

## 1.6. Waterfall i synchronizacja czasu

- Requesty są nanoszone na wspólną oś czasu replay.
- Marker bieżącego czasu podąża za odtwarzaniem.
- Kliknięcie requestu wykonuje seek do odpowiedniego miejsca.
- Widok może automatycznie śledzić requesty odpowiadające aktualnemu czasowi.

---

# 2. Odtwarzacz Session Replay

## 2.1. Automatyczne uruchamianie

- Kliknięcie replay na liście uruchamia wybraną sesję automatycznie.
- Szybka zmiana sesji nie może uruchomić poprzedniej instancji rrweb.
- Żądanie autoplay jest związane z ID sesji i wersją wyboru.
- Ponowne wybranie zakończonego replay rozpoczyna odtwarzanie od początku.

## 2.2. Seek zachowujący stan

- Kliknięcie osi czasu zachowuje wcześniejszy stan play/pause.
- Kliknięcie eventu lub requestu nie zatrzymuje odtwarzania, jeżeli wcześniej trwało.
- Podgląd czasu podczas przeciągania zapamiętuje stan odtwarzacza.
- Adapter `ReplayPlayerAdapter` izoluje fork od zmian API rrweb w upstreamie.

## 2.3. Definicja aktywności

Aktywność jest obliczana z eventów rrweb reprezentujących pełny snapshot, meta eventy oraz wspierane źródła incremental events, w tym ruch myszy, kliknięcia, wpisywanie i interakcje formularzy.

Każde okno aktywności:

- zaczyna się 500 ms przed eventem,
- kończy się 1000 ms po ostatnim evencie,
- łączy nakładające się fragmenty,
- przechowuje liczbę eventów w segmencie.

## 2.4. Pomijanie bezczynności

- Jest domyślnie włączone.
- Nieaktywne fragmenty są pomijane skokowo zamiast tylko przyspieszane.
- Odtwarzacz zatrzymuje pomijanie przed aktywnością i wraca do niego po końcu okna aktywności.
- Stare replay bez nowego profilu aktywności korzystają z trybu zgodności.
- Brak wykrytych eventów aktywności nie blokuje ręcznego odtwarzania.
- Przycisk pozwala tymczasowo wyłączyć lub włączyć mechanizm.

## 2.5. Oś czasu

Oś czasu pokazuje warstwy:

- postęp odtwarzania,
- eventy kluczowe,
- eventy techniczne,
- requesty sieciowe,
- segmenty aktywności i bezczynności,
- wybrany zakres eksportu.

Panel sterowania znajduje się pod osiami czasu, aby obie osie wykorzystywały całą szerokość playera.

## 2.6. Lista replay

- Domyślny minimalny czas nagrania wynosi 5 sekund.
- Lista przechowuje filtry liczby odsłon, eventów i minimalnego czasu.
- Wspierane są starsze replay oraz nagrania bez eventów aktywności.

---

# 3. Eksport replay

## 3.1. Wybór zakresu

- Zakres zaznacza się bezpośrednio na głównej osi czasu.
- Maksymalna długość wynosi 2 minuty.
- Przesuwanie końca zakresu przesuwa początek, gdy trzeba zachować maksymalną długość.
- Przesuwanie początku działa analogicznie.
- Eksport nie wymaga osobnego okna konfiguracji zakresu.

## 3.2. Zasady generowania

- Film zawsze pomija bezczynność.
- Aktywne fragmenty są renderowane z prędkością 1x.
- Eksport uruchamia się bezpośrednio przyciskiem przy timeline.
- Renderer używa Chromium i ffmpeg dostępnych w obrazie backendu.

## 3.3. Zawartość paczki

Paczka diagnostyczna zawiera wyłącznie:

1. powtórkę WebM,
2. metadane replay i wybranego zakresu,
3. czytelny log requestów wyłącznie dla hosta `api.wot-cv.com`.

Usunięto redundantne screenshoty, HAR, CSV, raporty i README, aby paczka nadawała się bezpośrednio do załączenia w zgłoszeniu GitHub.

## 3.4. Kolejka i bezpieczeństwo

- Eksporty są przetwarzane przez BullMQ.
- Worker ma współbieżność równą 1.
- Użytkownik może mieć maksymalnie 3 aktywne eksporty.
- Zakończone i nieudane zadania są usuwane po 2 godzinach, z limitem 200 rekordów.
- Status i pobranie wymagają dostępu do strony oraz zgodności właściciela zadania.

---

# 4. Tożsamość użytkownika i awatary

## 4.1. Rozpoznawanie nazwy

Kolejność wyboru nazwy:

1. trait `username`,
2. trait `name`,
3. trait `email`,
4. `identified_user_id`,
5. deterministyczna nazwa wygenerowana z `user_id`.

WoT-CV może przekazywać nazwę w formacie `[TAG] username`.

## 4.2. Awatar lub logo klanu

Kanonicznym polem jest `avatarUrl`. Dla zgodności odczytywane są także:

- `logoUrl`,
- `imageUrl`,
- `avatar_url`,
- `picture`.

Akceptowane są wyłącznie poprawne URL HTTP/HTTPS o długości do 2048 znaków. Niepoprawny lub brakujący URL uruchamia deterministyczny fallback Rybbit.

## 4.3. Miejsca użycia

Nazwy i awatary są widoczne w:

- liście replay,
- liście sesji,
- profilu użytkownika,
- tabeli użytkowników,
- tooltipach globusa,
- panelu szczegółów replay.

## 4.4. Globus

- Dane lokalizacji sesji zawierają traits i identyfikację użytkownika.
- Tooltip globusa pokazuje nazwę użytkownika bez konieczności otwierania szczegółów.
- Dynamiczna treść tooltipa jest escapowana przed wstawieniem do HTML.
- Obsługiwane są tryby mapy 2D i 3D; self-hosted domyślnie startuje w 2D.

---

# 5. Growth Accounting

## 5.1. Klasyfikacja użytkowników

| Stan | Definicja |
| --- | --- |
| Nowy | Pierwsza aktywność użytkownika przypada na bieżący okres. |
| Powracający | Użytkownik był aktywny w bieżącym i bezpośrednio poprzednim okresie. |
| Reaktywowany | Użytkownik wrócił po co najmniej jednym okresie nieaktywności. |
| Uśpiony | Użytkownik był aktywny poprzednio, ale nie wrócił w bieżącym okresie. |

## 5.2. Widok retencji

- Wykres znajduje się nad standardową retencją.
- Dostępny jest tryb dzienny i tygodniowy.
- Domyślnym trybem jest dzienny.
- Tryb jest respektowany przez API i klucze React Query.
- Tooltipy legendy wyjaśniają wszystkie cztery stany.
- Wykres używa dodatnich słupków dla aktywnych grup i ujemnych dla uśpionych.

## 5.3. Własne dashboardy

- „Analiza wzrostu” jest presetem w oknie dodawania karty.
- Karta używa dedykowanego źródła `growth-accounting`, a nie arbitralnego SQL.
- Można ją dodać do dowolnego własnego pulpitu.
- Karta korzysta z globalnego zakresu czasu dashboardu.

---

# 6. Funkcje analityczne udostępnione na self-hosted

## 6.1. Funkcje dostępne bez dodatkowej konfiguracji

| Funkcja | Status | Uwagi |
| --- | --- | --- |
| Strony / Pages | Dostępne | Wymaga standardowych pageview. |
| Wydajność / Performance | Zależne od danych | Wymaga aktywnego Web Vitals i eventów `performance`. |
| Boty | Zależne od danych | Wymaga eventów klasyfikowanych jako ruch botów. |
| Zapytania niestandardowe | Dostępne | Self-hosted zachowuje własne zapytania SQL. |
| Własne dashboardy | Dostępne | Dostępne razem z presetem Growth Accounting. |
| Session Replay | Dostępne | Bez komercyjnego limitu planu. |
| Network Replay | Dostępne | Po włączeniu per strona. |
| Import danych | Dostępne | Bez cloudowego gate planu i limitu importu. |
| Klucze API | Dostępne | Bez gate planu komercyjnego. |
| Eksport CSV | Dostępne | Standardowy eksport danych. |
| Eksport PDF | Dostępne | Backend i UI nie wymagają płatnego planu na self-hosted. |
| Web Vitals | Dostępne | Widoczne przy tworzeniu strony i w ustawieniach śledzenia. |
| Atrybucja GeoIP | Dostępne | Informacja o MaxMind jest widoczna również na self-hosted. |

## 6.2. Centralne capabilities analityczne

Fork nie rozsiewa już warunków po sidebarze. `ANALYTICS_CAPABILITIES` steruje:

- `pageAnalytics`,
- `performanceAnalytics`,
- `botAnalytics`,
- `customQueries`,
- `customDashboards`.

Profil `DEPLOYMENT=self-hosted` udostępnia rozszerzoną analitykę webową bez aktywowania Stripe, AppSumo ani usług Rybbit Cloud.

---

# 7. Funkcje odblokowane warunkowo zamiast przez `IS_CLOUD`

## 7.1. Runtime capabilities

Publiczny endpoint `/api/config` zwraca wyłącznie boolean capabilities. Sekrety nie trafiają do klienta.

| Capability | Wymagana konfiguracja | Efekt w UI/backendzie |
| --- | --- | --- |
| Google Search Console | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` oraz `GOOGLE_REDIRECT_URI` lub `BASE_URL` | Pokazuje Integracje i kartę Search Console na stronie głównej. |
| Logowanie Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Pokazuje przycisk Google i rejestruje provider Better Auth. |
| Logowanie GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Pokazuje przycisk GitHub i rejestruje provider Better Auth. |
| E-mail transakcyjny | `RESEND_API_KEY`, `EMAIL_FROM` | Włącza OTP, weryfikację e-mail, reset hasła i zaproszenia. |
| Raporty tygodniowe | E-mail transakcyjny oraz `ENABLE_WEEKLY_REPORTS=true` | Uruchamia cron i pokazuje przełącznik raportów na koncie. |
| Cloudflare Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Chroni formularze logowania, rejestracji, zaproszeń i resetu hasła. |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Włącza zewnętrzny storage batchy replay. |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Umożliwia SMS w mechanizmie powiadomień uptime. |

## 7.2. Google Search Console

Po konfiguracji dostępne są:

- połączenie konta Google,
- bezpieczny podpisany state OAuth,
- sprawdzenie uprawnień administratora strony,
- wybór property Search Console,
- odświeżanie tokenu,
- odłączenie integracji,
- dane słów kluczowych i stron w dashboardzie głównym.

Callback GSC domyślnie używa `${BASE_URL}/api/gsc/callback`. Dla logowania społecznościowego należy skonfigurować osobne callbacki Better Auth.

## 7.3. Logowanie społecznościowe

- Provider nie jest rejestrowany, jeżeli brakuje któregokolwiek credentiala.
- UI pokazuje wyłącznie skonfigurowane przyciski.
- Google i GitHub mogą być aktywowane niezależnie.
- Nie trzeba ustawiać `CLOUD=true`.

## 7.4. E-mail i zaproszenia

Po skonfigurowaniu Resend działają:

- OTP logowania,
- weryfikacja adresu e-mail,
- zmiana adresu e-mail,
- reset hasła,
- zaproszenia do organizacji,
- opcjonalne raporty tygodniowe.

Self-hosted wymaga jawnego `EMAIL_FROM` z domeny zweryfikowanej w Resend. `EMAIL_REPLY_TO` jest opcjonalne.

Marketingowe wiadomości powitalne, onboardingowe i reaktywacyjne pozostają wyłączone na self-hosted.

## 7.5. Cloudflare Turnstile

- Backend rejestruje plugin captcha tylko po wykryciu obu kluczy.
- Klient wyświetla widget tylko wtedy, gdy capability jest aktywne.
- Token jest wymagany i przekazywany w `x-captcha-response`.
- Publiczny site key jest argumentem builda klienta, dlatego jego zmiana wymaga ponownego builda obrazu.

## 7.6. Cloudflare R2

- R2 nie wymaga trybu cloud.
- Bez pełnej konfiguracji usługa pozostaje wyłączona i zachowuje dotychczasowy fallback.
- Bucket domyślnie nazywa się `rybbit`, ale można go zmienić przez `R2_BUCKET_NAME`.
- Dane są kompresowane Zstandardem.
- Reader zachowuje zgodność z wcześniejszym gzip i niekompresowanym JSON.

## 7.7. Twilio

Klient Twilio inicjalizuje się na podstawie credentiali, a nie `IS_CLOUD`. Brak konfiguracji zwraca kontrolowany status „SMS not configured” bez zatrzymywania aplikacji.

---

# 8. Polski interfejs

## 8.1. Zakres

Polskie tłumaczenia obejmują m.in.:

- główną analitykę,
- bot analytics,
- replay i Network Replay,
- filtry i eventy,
- retencję i Growth Accounting,
- dashboards i query playground,
- uwierzytelnianie,
- ustawienia konta, organizacji i stron,
- admin,
- uptime,
- billingowe powierzchnie odziedziczone z upstreamu,
- komunikaty błędów, puste stany i tooltipy.

## 8.2. Kontrola jakości

`npm run audit:polish` sprawdza:

- brakujące polskie wartości,
- wartości identyczne z angielskimi,
- zgodność placeholderów,
- deterministyczny wynik audytu.

Pozostałe locale nie zostały usunięte i nadal są obsługiwane.

---

# 9. Deployment i utrzymanie forka

## 9.1. Identyfikowalne buildy

Każdy build przekazuje:

- `WOTCV_GIT_SHA`,
- `WOTCV_IMAGE_TAG`,
- `WOTCV_BUILD_TIME`,
- `WOTCV_DEPLOYED_AT`.

`/api/health` zwraca SHA, tag obrazu, digest, czas builda, czas wdrożenia i URL kodu źródłowego.

## 9.2. Skrypt aktualizacyjny

Wrapper `scripts/update_rybbit_wotcv.sh` oraz kopia w `/home/wotcv/tools` wykonują:

1. blokadę `flock`,
2. kontrolę repozytorium,
3. fetch i fast-forward `origin/feat/wotcv`,
4. walidację Compose,
5. lokalny build backendu i klienta,
6. kontrolę zawartości obrazów,
7. restart wymaganych kontenerów,
8. lokalny i publiczny healthcheck,
9. zapis logu aktualizacji,
10. rollback do poprzednich obrazów po błędzie healthchecka.

## 9.3. Bezpieczeństwo deploymentu

- Working tree musi być czysty.
- Skrypty nie wykonują force-push.
- Obrazy używają niezmiennych tagów `sha-<commit>`.
- Projekt Compose zachowuje nazwę `rybbit` i istniejące wolumeny.
- Tymczasowe pliki i locki mają unikalne nazwy oraz kontrolę właściciela.
- Runtime obrazu klienta zawiera właściwy serwer Next.js standalone.
- Runtime obrazu backendu zawiera `@rybbit/shared`.

## 9.4. Synchronizacja upstreamu

- `master` reprezentuje upstream.
- `feat/wotcv` zawiera rozszerzenia WoT-CV.
- Najpierw aktualizowany jest `master`, potem wykonywany merge do `feat/wotcv`.
- Konflikty rozwiązuje się per funkcja; nie wolno zastępować całych katalogów strategią `ours`.

---

# 10. Zgodność z AGPL-3.0

Fork zachowuje licencję AGPL-3.0 i publikuje odpowiadający kod źródłowy przez:

- link w interfejsie klienta,
- endpoint `/api/source`,
- pole `sourceCodeUrl` w `/api/health`,
- nagłówek HTTP `Link`,
- nagłówek `X-Source-Code`,
- banner w `script.js` i `script-full.js`,
- dokumentację w `README.md` i `NOTICE.md`.

URL wskazuje dokładny commit odpowiadający uruchomionemu obrazowi. Sekrety, pliki `.env` i dane użytkowników nie są publikowane jako część Corresponding Source.

---

# 11. Testy i bramki jakości

Fork dodał lub rozszerzył testy dla:

- konfiguracji Network Replay,
- lifecycle recordera,
- batchowania i retry replay,
- parsera eventów sieciowych,
- filtrów sieciowych,
- matematyki timeline,
- eksportu replay,
- aktywności i pomijania bezczynności,
- Growth Accounting,
- capabilities self-hosted,
- identity i bezpiecznych avatar URL,
- dostępności kodu źródłowego AGPL,
- runtime capabilities usług zewnętrznych.

Główne komendy:

```bash
cd client
npm run test:run
npm run lint:wotcv
npm run knip
npm run audit:polish
npm run format:check:wotcv
npx tsc --noEmit
npm run build

cd ../server
npm run test:run
npm run db:check
npm run check:analytics
npm run build
```

Workflow `.github/workflows/build-wotcv-images.yml` wykonuje walidację przed publikacją obrazów.

---

# 12. Funkcje świadomie pozostawione cloud-only

Poniższe elementy nie zostały odblokowane, ponieważ zależą od komercyjnych usług, rozliczeń lub infrastruktury Rybbit Cloud:

| Funkcja | Powód pozostawienia blokady |
| --- | --- |
| Stripe Billing | Wymaga produktów, cen, webhooków i portalu klienta Rybbit Cloud. |
| AppSumo | Wymaga licencji, webhooków i credentiali partnera. |
| Rewardful i affiliate | Dotyczy programu partnerskiego usługi cloud. |
| Limity planów i upgrade overlay | Self-hosted nie korzysta z komercyjnych planów Rybbit. |
| Faktury i zarządzanie subskrypcją | Są częścią Stripe Cloud. |
| Marketing onboarding/reengagement | Nie powinien wysyłać wiadomości w imieniu upstreamu. |
| E-mail support Rybbit | Jest usługą supportową upstreamu. |
| Globalny multi-region uptime | Wymaga rozproszonej infrastruktury agentów. Self-hosted pozostaje w trybie lokalnym. |
| AppSumo callback i trial signup | Są elementami komercyjnego procesu rejestracji. |
| Centralna telemetria cloud | Self-hosted zachowuje własne ustawienie `DISABLE_TELEMETRY`. |

Nie należy ustawiać `CLOUD=true` tylko po to, aby pokazać ukryte elementy. Mogłoby to uruchomić Stripe, AppSumo, limity planów, marketing i inne procesy nieprzeznaczone dla self-hosted.

---

# 13. Macierz konfiguracji self-hosted

| Cel | Zmienne |
| --- | --- |
| Rozszerzone ekrany analityczne | `DEPLOYMENT=self-hosted` |
| Google login i GSC | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, opcjonalnie `GOOGLE_REDIRECT_URI` |
| GitHub login | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, opcjonalnie `EMAIL_REPLY_TO` |
| Raporty tygodniowe | Konfiguracja Resend i `ENABLE_WEEKLY_REPORTS=true` |
| Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, opcjonalnie `R2_BUCKET_NAME` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Mapbox / mapa 3D | `MAPBOX_TOKEN` |

---

# 14. Checklista funkcjonalna forka

Po wdrożeniu nowego commita należy sprawdzić:

1. `/api/health` i `sourceCodeUrl`.
2. `script.js` oraz obecność trackera Network Replay.
3. nagrywanie fetch i XHR.
4. requesty Performance Resource Timing.
5. filtry hosta, metody, statusu i czasu.
6. correlation ID, timingi, nagłówki i body.
7. autoplay po wyborze replay.
8. seek zachowujący play/pause.
9. pomijanie bezczynności i okna 500/1000 ms.
10. stare replay bez profilu aktywności.
11. wybór zakresu eksportu do 2 minut.
12. zawartość paczki eksportu.
13. Growth Accounting dziennie i tygodniowo.
14. dodanie Growth Accounting do własnego dashboardu.
15. awatary i nazwy użytkowników na listach i globusie.
16. strony Pages, Performance i Bots.
17. Web Vitals na nowej i istniejącej stronie.
18. eksport PDF.
19. każdą skonfigurowaną capability runtime.
20. polskie tłumaczenia.
21. linki AGPL do dokładnego SHA.
22. aktualizację i rollback skryptu wdrożeniowego.

## Utrzymanie dokumentu

Po każdej nowej funkcji forka lub merge z upstreamem należy:

1. porównać `origin/master...feat/wotcv`,
2. zaktualizować odpowiednią sekcję katalogu,
3. wskazać, czy funkcja jest dostępna, konfigurowalna, zależna od danych czy cloud-only,
4. dopisać wymagane zmienne środowiskowe,
5. rozszerzyć checklistę walidacji,
6. upewnić się, że dokument nie opisuje planów jako już działających funkcji.
