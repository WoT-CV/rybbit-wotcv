# WoT-CV Rybbit — szczegółowy plan implementacji Network Session Replay

**Repozytorium docelowe:** `WoT-CV/rybbit-wotcv`  
**Upstream:** `rybbit-io/rybbit`  
**Status dokumentu:** plan zatwierdzający zakres prac przed implementacją  
**Data utworzenia:** 2026-07-10

---

## 1. Cel projektu

Celem jest rozwinięcie forka Rybbit o natywne nagrywanie ruchu sieciowego przeglądarki i ścisłe zsynchronizowanie go z istniejącym Session Replay.

Docelowo podczas oglądania nagrania sesji ma być możliwe ustalenie:

- co użytkownik zrobił w danym momencie,
- jaki request został wtedy uruchomiony,
- kiedy request się rozpoczął i zakończył,
- jak długo trwał,
- jaką metodą i pod jaki URL został wysłany,
- jakie zawierał nagłówki i body,
- jaki status, nagłówki i body zwrócił serwer,
- czy request zakończył się sukcesem, błędem, przerwaniem albo timeoutem,
- jaka zmiana DOM lub jaki błąd konsoli wystąpił po odpowiedzi,
- jakie requesty były aktywne w konkretnym momencie odtwarzania.

Poziom funkcjonalny ma być zbliżony do inspektora network w Session Replay PostHoga, ale implementacja ma wykorzystywać obecną architekturę Rybbit zamiast budować osobny system replay.

---

## 2. Najważniejsze decyzje architektoniczne

### 2.1. Wykorzystujemy istniejący Session Replay Rybbit

Rybbit już posiada:

- recorder oparty o `rrweb`,
- buforowanie i batchowanie eventów,
- endpoint ingest replay,
- zapis eventów do ClickHouse albo R2,
- endpoint pobierający wszystkie eventy sesji,
- player oparty o `rrweb-player`,
- boczny timeline z możliwością `player.goto(offset)`,
- parser zdarzeń znaczących dla użytkownika,
- retencję danych replay.

Network replay ma zostać dołączony jako event pluginowy `rrweb`, a nie jako drugi niezależny recorder.

Podstawowe pliki istniejącej implementacji:

- `server/src/analytics-script/sessionReplay.ts`
- `server/src/analytics-script/types.ts`
- `server/src/analytics-script/config.ts`
- `server/src/services/replay/sessionReplayIngestService.ts`
- `server/src/services/replay/sessionReplayQueryService.ts`
- `server/src/db/clickhouse/clickhouse.ts`
- `client/src/components/replay/replayEvents.ts`
- `client/src/components/replay/ReplayBreadcrumbs.tsx`
- `client/src/components/replay/player/*`

### 2.2. Format eventu zgodny koncepcyjnie z `rrweb/network@1`

Nazwa pluginu:

```ts
export const NETWORK_PLUGIN_NAME = "rrweb/network@1";
```

Pozwala to:

- zachować spójność z ekosystemem `rrweb`,
- wzorować się na sprawdzonym rozwiązaniu PostHoga,
- uniknąć wprowadzania specjalnego typu transportowego w backendzie Rybbit,
- w przyszłości łatwiej przejść na oficjalny plugin `rrweb`, jeśli stanie się stabilny.

### 2.3. Wersja 1 zapisuje surowe dane bez maskowania networku

W pierwszej wersji:

- nie maskujemy URL-i,
- nie maskujemy query parameters,
- nie maskujemy request headers,
- nie maskujemy response headers,
- nie maskujemy request body,
- nie maskujemy response body,
- nie redagujemy tokenów, adresów e-mail ani innych pól,
- nie stosujemy allowlist ani denylist biznesowych endpointów.

To założenie dotyczy nowej warstwy **network capture**. Nie zmieniamy w tym zadaniu istniejącego maskowania DOM i inputów realizowanego przez `rrweb`, ponieważ jest to osobny mechanizm obecnego Session Replay.

Brak maskowania nie oznacza braku ograniczeń technicznych. Nadal muszą istnieć:

- wykluczenie requestów samego trackera Rybbit, aby nie utworzyć pętli rekurencyjnej,
- limit rozmiaru pojedynczego body i eventu,
- timeout odczytu sklonowanego body,
- bezpieczna obsługa typów binarnych i streamów,
- możliwość natychmiastowego wyłączenia funkcji konfiguracją.

Surowy capture jest sterowany wyłącznie konfiguracją per site. Decyzje dotyczące miejsca i momentu włączenia funkcji, pomiarów wdrożeniowych oraz konfiguracji docelowej podejmuje właściciel instalacji poza zakresem tego planu.

### 2.4. V1 korzysta z obecnej tabeli `session_replay_events`

Network eventy zostaną zapisane jako pluginowe eventy `type = 6` w obecnym strumieniu replay.

Nie tworzymy w V1:

- osobnej tabeli ClickHouse dla networku,
- osobnego endpointu ingest,
- osobnego identyfikatora sesji,
- osobnego mechanizmu retencji.

Zalety:

- zachowana zostaje jedna oś czasu,
- brak problemu z korelowaniem dwóch niezależnych pipeline’ów,
- istniejący backend już zapisuje dowolne `event.data`,
- istniejący endpoint odczytu zwraca eventy posortowane po timestampie,
- minimalizujemy zakres zmian i konflikty z upstreamem.

Jeżeli walidacja wykaże, że pełne body powodują zbyt duże odpowiedzi endpointu replay, kolejnym krokiem będzie wydzielenie ciężkich payloadów do osobnego storage i ich lazy loading. Nie jest to część pierwszej implementacji.

---

## 3. Zakres V1

### 3.1. Requesty objęte nagrywaniem

V1 ma obsługiwać:

1. `window.fetch`:
   - wszystkie metody,
   - request przekazany jako URL i `RequestInit`,
   - request przekazany jako obiekt `Request`,
   - sukces,
   - odpowiedź HTTP 4xx/5xx,
   - rejection Promise,
   - `AbortError`.

2. `XMLHttpRequest`:
   - `open`,
   - `setRequestHeader`,
   - `send`,
   - `loadend`,
   - `error`,
   - `abort`,
   - `timeout`,
   - różne wartości `responseType`.

3. `PerformanceObserver` / Resource Timing:
   - navigation,
   - fetch,
   - xmlhttprequest,
   - script,
   - css/link,
   - image/img,
   - iframe/frame,
   - beacon/ping,
   - font,
   - pozostałe dostępne `initiatorType`.

Dla fetch/XHR podstawowym źródłem jest wrapper, ponieważ tylko on może zebrać metodę, status, headers i body. `PerformanceObserver` uzupełnia dokładne timingi i zasoby, których nie można przechwycić wrapperem.

### 3.2. Poza zakresem V1

W pierwszej wersji nie implementujemy:

- nagrywania wiadomości WebSocket,
- nagrywania eventów Server-Sent Events,
- backend-to-backend HTTP tracing,
- OpenTelemetry trace correlation,
- source maps dla błędów backendu,
- automatycznej analizy przyczyny błędu,
- dynamicznego maskowania,
- reguł JSONPath dla body,
- reguł maskowania per endpoint,
- osobnych agregatów APM,
- waterfall DNS/TCP/TLS dla requestów, jeśli przeglądarka nie udostępnia tych danych,
- odczytu `HttpOnly` cookies,
- odczytu nagłówków ukrytych przez politykę CORS przeglądarki.

---

## 4. Model danych network eventu

### 4.1. Proponowane typy

Nowe typy powinny zostać odizolowane w katalogu:

```text
server/src/analytics-script/networkReplay/
```

Proponowany model:

```ts
export type NetworkOutcome =
  | "success"
  | "http_error"
  | "network_error"
  | "aborted"
  | "timeout"
  | "pending_on_unload";

export type CapturedBodyKind =
  | "empty"
  | "text"
  | "json"
  | "form-data"
  | "url-search-params"
  | "blob-metadata"
  | "array-buffer-metadata"
  | "stream-unavailable"
  | "binary-unavailable"
  | "unreadable"
  | "too-large"
  | "timeout";

export interface CapturedBody {
  kind: CapturedBodyKind;
  value?: string;
  contentType?: string;
  sizeBytes?: number;
  truncated?: boolean;
  reason?: string;
}

export interface CapturedNetworkTiming {
  startTime?: number;
  fetchStart?: number;
  domainLookupStart?: number;
  domainLookupEnd?: number;
  connectStart?: number;
  secureConnectionStart?: number;
  connectEnd?: number;
  requestStart?: number;
  responseStart?: number;
  responseEnd?: number;
  duration?: number;
}

export interface CapturedNetworkSizes {
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
}

export interface CapturedNetworkError {
  name?: string;
  message?: string;
  stack?: string;
}

export interface CapturedNetworkRequest {
  schemaVersion: 1;
  requestId: string;

  currentUrl: string;
  url: string;
  method: string;
  initiatorType: string;

  startedAt: number;
  completedAt?: number;
  durationMs?: number;

  status?: number;
  statusText?: string;
  outcome: NetworkOutcome;

  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: CapturedBody;
  responseBody?: CapturedBody;

  timing?: CapturedNetworkTiming;
  sizes?: CapturedNetworkSizes;
  error?: CapturedNetworkError;

  performanceEntryFound: boolean;
  bodyCaptureCompletedAt?: number;
}

export interface NetworkPluginPayload {
  version: 1;
  requests: CapturedNetworkRequest[];
}
```

### 4.2. Event rrweb

```ts
{
  type: 6,
  timestamp: 1783678123456,
  data: {
    plugin: "rrweb/network@1",
    payload: {
      version: 1,
      requests: [capturedRequest]
    }
  }
}
```

### 4.3. Zasady timestampów

Dla każdego requestu zapisujemy co najmniej:

- `startedAt` — absolutny timestamp początku requestu,
- `completedAt` — absolutny timestamp zakończenia sieciowego,
- `durationMs = completedAt - startedAt`,
- `bodyCaptureCompletedAt` — opcjonalny moment zakończenia odczytu klona body.

Oś czasu UI nie może opierać początku requestu na timestampie emisji pluginu, ponieważ plugin może zostać wyemitowany dopiero po odczytaniu response body.

Offsety UI:

```ts
startOffset = request.startedAt - replayStartTimestamp;
endOffset = (request.completedAt ?? request.startedAt) - replayStartTimestamp;
```

Kliknięcie requestu na timeline przewija player do `startOffset`.

W trakcie odtwarzania:

- `currentTime < startOffset` — request jeszcze się nie rozpoczął,
- `startOffset <= currentTime < endOffset` — request ma stan `pending`,
- `currentTime >= endOffset` — request ma stan końcowy.

### 4.4. Identyfikator requestu

Każdy request otrzymuje `requestId` generowany po stronie trackera, np. przez `crypto.randomUUID()` z fallbackiem.

Identyfikator służy do:

- deduplikacji wrapper + PerformanceObserver,
- stabilnego klucza React,
- korelacji przyszłych rozszerzeń,
- diagnostyki brakujących eventów.

---

## 5. Implementacja recordera network

### 5.1. Struktura katalogów

Aby ograniczyć konflikty z upstreamem, większość nowego kodu umieszczamy w nowych plikach:

```text
server/src/analytics-script/networkReplay/
├── index.ts
├── networkPlugin.ts
├── types.ts
├── config.ts
├── bodyCapture.ts
├── headerCapture.ts
├── fetchObserver.ts
├── xhrObserver.ts
├── performanceObserver.ts
├── pendingRequests.ts
├── ignoredTrackerRequests.ts
├── timing.ts
└── utils.ts
```

Zmiany w istniejących plikach powinny być możliwie małe:

- `server/src/analytics-script/sessionReplay.ts`
- `server/src/analytics-script/types.ts`
- `server/src/analytics-script/config.ts`
- ewentualnie konfiguracja site i tracking config.

### 5.2. Integracja z `rrweb.record`

`sessionReplay.ts` musi rozszerzyć lokalny typ opcji `rrweb.record` o `plugins`:

```ts
plugins?: Array<{
  name: string;
  observer: (...args: any[]) => () => void;
  options?: unknown;
}>;
```

Podczas uruchomienia replay:

```ts
const plugins = [];

if (this.config.networkReplay?.enabled) {
  plugins.push(getRecordNetworkPlugin(this.config.networkReplay));
}

const recordingOptions = {
  ...existingOptions,
  plugins,
};
```

Recorder network musi być uruchamiany tylko wtedy, gdy:

- działa Session Replay,
- sesja została wybrana przez sampling replay,
- `networkReplay.enabled === true`.

Nie nagrywamy networku dla sesji, która nie posiada replay DOM.

### 5.3. Wrapper `fetch`

Wymagania:

1. Zachować oryginalny `window.fetch` i kontekst wywołania.
2. Instrumentacja nie może zmienić requestu wysyłanego przez aplikację.
3. Błędy instrumentacji nie mogą powodować błędu requestu aplikacji.
4. Odczyt body musi odbywać się z klona.
5. Odpowiedź musi zostać zwrócona aplikacji bez oczekiwania na zakończenie odczytu sklonowanego response body.
6. Rejection oryginalnego fetch musi zostać ponownie rzucony bez zmiany obiektu błędu.

Zalecany przepływ:

```text
utworzenie requestId
→ zapis startedAt
→ przygotowanie bezpiecznego klona Request
→ rozpoczęcie asynchronicznego odczytu request body
→ wywołanie oryginalnego fetch
→ zapis completedAt natychmiast po otrzymaniu Response
→ przygotowanie klona Response
→ zwrot oryginalnego Response do aplikacji
→ asynchroniczny odczyt response body
→ dołączenie PerformanceResourceTiming
→ emisja network eventu
```

W przypadku błędu:

```text
fetch reject
→ completedAt
→ outcome network_error albo aborted
→ zapis błędu
→ emisja network eventu
→ ponowne rzucenie oryginalnego błędu
```

### 5.4. Wrapper `XMLHttpRequest`

Stan requestu przechowujemy w `WeakMap<XMLHttpRequest, XhrRequestState>`.

Instrumentacja obejmuje:

- patch `open` — metoda i URL,
- patch `setRequestHeader` — request headers,
- patch `send` — body i startedAt,
- `loadend` — wspólny koniec requestu,
- `error`, `abort`, `timeout` — outcome,
- `getAllResponseHeaders` — response headers,
- `status`, `statusText`, `responseType`, `response`.

Dla body XHR:

- `responseType = ""` albo `"text"` — zapis tekstu,
- `responseType = "json"` — JSON stringify bez maskowania,
- `blob` — metadata blobu,
- `arraybuffer` — metadata rozmiaru,
- `document` — tekst lub marker braku możliwości serializacji.

Listener cleanup musi nastąpić po zakończeniu requestu, aby uniknąć wycieków pamięci.

### 5.5. `PerformanceObserver`

Observer ma:

- zebrać wpisy `resource` i `navigation`,
- uzupełnić timingi fetch/XHR,
- utworzyć osobne eventy dla zasobów nieobsługiwanych przez wrapper,
- zebrać zasoby rozpoczęte przed inicjalizacją recordera, jeśli konfiguracja na to pozwala,
- odłączyć się podczas stop/cleanup.

Deduplikacja fetch/XHR powinna korzystać z kombinacji:

- pełny URL,
- `initiatorType`,
- przedział czasu startu,
- tolerancja czasowa,
- najbliższy jeszcze nieprzypisany wpis PerformanceResourceTiming.

### 5.6. Body capture

V1 zapisuje surową treść, ale nie może blokować aplikacji.

Wymagania:

- odczyt tylko z klona,
- timeout odczytu,
- limit bajtów,
- przerwanie czytania po przekroczeniu limitu,
- nigdy nie oczekiwać na body w ścieżce krytycznej aplikacji,
- oznaczyć powód braku body zamiast rzucać wyjątek.

Proponowane wartości początkowe V1:

```ts
maxBodySizeBytes: 1_000_000;
bodyReadTimeoutMs: 1_000;
maxNetworkEventSizeBytes: 2_500_000;
```

Limit nie jest maskowaniem. Po przekroczeniu zapisujemy metadata i `kind = "too-large"`.

### 5.7. Requesty trackera, których nie wolno nagrywać

Bezwarunkowo wykluczamy requesty wysyłane do własnego ingest Rybbit. W przeciwnym razie wysłanie eventu network wygeneruje kolejny event network i powstanie pętla.

Wykluczenie powinno bazować na `analyticsHost` oraz znanych ścieżkach trackera, m.in.:

- endpoint trackingu eventów,
- endpoint Session Replay ingest,
- tracking config,
- feature flag evaluation,
- skrypty `script.js`, `replay.js`, `metrics.js`.

Wykluczenie ma być realizowane przed próbą odczytu body.

To jedyna obowiązkowa denylista V1. Nie jest to maskowanie danych biznesowych.

### 5.8. Requesty niezakończone podczas unload

Recorder utrzymuje mapę requestów pending.

Podczas cleanup:

- pending requesty zostają oznaczone `pending_on_unload`,
- otrzymują `completedAt = Date.now()` tylko jako moment zakończenia obserwacji,
- dostają informację, że rzeczywisty wynik jest nieznany,
- eventy zostają dodane do bufora przed finalnym flush.

Kolejność cleanup:

```text
finalizacja network pending
→ zatrzymanie network observerów i przywrócenie patchy
→ zatrzymanie rrweb
→ finalny flush eventBuffer
```

---

## 6. Konfiguracja per site

### 6.1. Założenie

Network replay ma być wyłączony domyślnie i sterowany per strona.

Zamiast wielu kolumn preferowana jest jedna rozszerzalna kolumna JSONB:

```ts
networkReplayConfig: jsonb("network_replay_config")
  .$type<NetworkReplayConfig>()
  .default({ enabled: false });
```

Proponowany typ:

```ts
export interface NetworkReplayConfig {
  enabled: boolean;

  captureFetch: boolean;
  captureXhr: boolean;
  capturePerformanceResources: boolean;
  captureInitialPerformanceResources: boolean;

  captureRequestHeaders: boolean;
  captureResponseHeaders: boolean;
  captureRequestBody: boolean;
  captureResponseBody: boolean;

  maxBodySizeBytes: number;
  bodyReadTimeoutMs: number;
  maxNetworkEventSizeBytes: number;
  maxReplayBatchSizeBytes: number;
}
```

Przykładowa konfiguracja V1:

```json
{
  "enabled": true,
  "captureFetch": true,
  "captureXhr": true,
  "capturePerformanceResources": true,
  "captureInitialPerformanceResources": true,
  "captureRequestHeaders": true,
  "captureResponseHeaders": true,
  "captureRequestBody": true,
  "captureResponseBody": true,
  "maxBodySizeBytes": 1000000,
  "bodyReadTimeoutMs": 1000,
  "maxNetworkEventSizeBytes": 2500000,
  "maxReplayBatchSizeBytes": 7000000
}
```

Brak pól maskowania w V1 jest świadomy. JSONB pozwoli dodać je później bez kolejnej migracji kolumn.

### 6.2. Miejsca do zmiany

Backend/config:

- `server/src/db/postgres/schema.ts`
- migracja Drizzle dla `network_replay_config`
- `server/src/lib/siteConfig.ts`
- endpoint pobierający tracking config,
- endpoint aktualizujący site config,
- walidacja requestu aktualizacji,
- typy shared używane przez client i server.

Tracker:

- `server/src/analytics-script/types.ts`
- `server/src/analytics-script/config.ts`

Dashboard Rybbit:

- settings strony,
- sekcja Session Replay,
- toggle Network Replay,
- pola limitów jako Advanced Settings,
- wyraźne ostrzeżenie, że V1 zapisuje surowe headers i body.

### 6.3. Zgodność wsteczna

- brak kolumny przed migracją nie może zatrzymać startu aplikacji,
- po migracji default to `enabled: false`,
- stare strony zachowują obecne zachowanie,
- zwykły Session Replay działa bez zmian,
- wyłączenie Network Replay nie zmienia formatu standardowych eventów rrweb.

---

## 7. Batchowanie, ingest i storage

### 7.1. Problem obecnej implementacji

Obecny recorder flushuje bufor głównie według:

- liczby eventów,
- interwału czasowego.

Pełne response body może sprawić, że mała liczba eventów przekroczy backendowy limit requestu wynoszący 10 MB.

### 7.2. Byte-aware batching

Do `SessionReplayRecorder` dodajemy:

- licznik przybliżonego rozmiaru bufora,
- estymację rozmiaru każdego eventu,
- flush przed przekroczeniem `maxReplayBatchSizeBytes`,
- wysłanie dużego eventu w osobnym batchu,
- odrzucenie albo oznaczenie eventu, który przekracza bezpieczny limit pojedynczego eventu.

Rekomendowany próg:

```ts
maxReplayBatchSizeBytes = 7_000_000;
```

Pozostawia to zapas na:

- metadata batcha,
- serializację JSON,
- pozostałe eventy rrweb,
- narzut HTTP.

### 7.3. Retry

Obecne ponowne dodawanie eventów do bufora po błędzie musi zostać przetestowane dla dużych payloadów.

Minimalne wymagania:

- brak nieskończonej pętli dla permanentnego HTTP 413,
- rozpoznanie 413 i podział batcha,
- jeżeli pojedynczy event nadal przekracza limit — zapis diagnostyczny i pominięcie body albo całego eventu zgodnie z ustaloną polityką,
- błędy trackera nie mogą wpływać na aplikację użytkownika.

### 7.4. Backend

Dla V1 `sessionReplayIngestService` nadal:

- serializuje `event.data`,
- zapisuje `event_type = 6`,
- zapisuje payload do ClickHouse albo R2,
- aktualizuje metadata sesji.

Wymagane testy:

- plugin event przechodzi przez ingest bez modyfikacji,
- duży event mieści się w limicie,
- kolejność eventów pozostaje prawidłowa,
- R2 reconstruction zachowuje payload network,
- usunięcie sesji usuwa również eventy network.

### 7.5. Retencja

V1 dziedziczy obecną retencję Session Replay. Nie wprowadzamy osobnego TTL dla networku.

Pomiary rozmiaru sesji, czasu pobierania i parsowania oraz zużycia ClickHouse/R2 prowadzi właściciel instalacji poza zakresem implementacji.

---

## 8. UI Session Replay

### 8.1. Parser network eventów

Nowy moduł:

```text
client/src/components/replay/network/
├── types.ts
├── parseNetworkEvents.ts
├── networkEventUtils.ts
├── NetworkRequestRow.tsx
├── NetworkRequestDetails.tsx
├── NetworkTimeline.tsx
├── NetworkWaterfall.tsx
└── BodyViewer.tsx
```

Parser:

- wyszukuje eventy `type = 6`,
- sprawdza `data.plugin === "rrweb/network@1"`,
- waliduje `payload.version`,
- rozwija `payload.requests`,
- oblicza offset start/end względem pierwszego eventu replay,
- sortuje po `startedAt`,
- nie rzuca wyjątku dla niepełnych lub starszych danych.

### 8.2. Zakładki timeline

Obecny panel:

```text
Key | All
```

Docelowy panel:

```text
Key | Network | All
```

`Key` zachowuje obecne zdarzenia użytkownika.  
`Network` pokazuje requesty.  
`All` pokazuje zdarzenia techniczne rrweb wraz z pluginami.

### 8.3. Wiersz requestu

Minimalny wygląd:

```text
00:02.438  POST  /wot-cv/api/players/check  200  184 ms
```

Elementy:

- offset początku,
- metoda,
- skrócony URL/path,
- status,
- duration,
- ikona typu requestu,
- oznaczenie błędu,
- oznaczenie przerwania/timeoutu,
- opcjonalny rozmiar transferu.

Kolory statusów:

- 2xx/3xx — neutralny/success,
- 4xx — warning,
- 5xx — error,
- network error/abort/timeout — error,
- pending — aktywny.

Kliknięcie wiersza:

- `player.goto(startOffset)`,
- aktualizacja store `currentTime`,
- otwarcie szczegółów requestu.

### 8.4. Szczegóły requestu

Zakładki:

```text
Overview | Timing | Request headers | Request body | Response headers | Response body | Raw
```

`Overview`:

- URL,
- method,
- status,
- outcome,
- startedAt,
- completedAt,
- duration,
- initiator type,
- current page URL,
- request ID.

`Timing`:

- start,
- DNS,
- connect,
- TLS,
- request,
- waiting/TTFB,
- response,
- total,
- informacja o brakujących danych.

Headers:

- tabela key/value,
- wyszukiwanie,
- copy value,
- copy all.

Body:

- JSON pretty print, jeśli treść jest poprawnym JSON,
- raw text fallback,
- informacja o typie i rozmiarze,
- oznaczenie `too-large`, `timeout`, `unreadable`,
- przycisk copy.

`Raw`:

- pełny zapis `CapturedNetworkRequest` jako JSON.

### 8.5. Waterfall na głównym timeline

Request jest przedziałem, nie pojedynczym markerem.

```text
startOffset ├════════════════════┤ endOffset
```

Wymagania:

- pozycja `left` zależy od startOffset,
- szerokość zależy od duration,
- minimalna szerokość dla bardzo szybkich requestów,
- błędy wyróżnione,
- hover pokazuje metodę, URL, status i duration,
- kliknięcie przewija do startu,
- request aktywny dla aktualnego `currentTime` jest wyróżniony.

### 8.6. Filtrowanie networku

Minimalne filtry:

- wyszukiwanie po URL,
- metoda,
- status group: all / errors / 2xx / 3xx / 4xx / 5xx,
- initiator type,
- tylko fetch/XHR,
- tylko requesty wolniejsze niż zadany próg.

### 8.7. Wydajność UI

- lista requestów musi pozostać zwirtualizowana,
- parsowanie wykonywane przez `useMemo`,
- body nie powinno być formatowane do momentu otwarcia szczegółów,
- duże JSON-y nie mogą blokować całego playera,
- błędny body parser nie może uszkodzić replay,
- należy rozważyć Web Worker dopiero wtedy, gdy obserwacje wydajności wskażą taką potrzebę.

---

## 9. Migracja istniejącej instalacji Rybbit do forka

### 9.1. Zasada podstawowa

Najbezpieczniejsza migracja to **zmiana Git remote w istniejącym katalogu instalacji**, a nie klonowanie do nowego katalogu.

Powody:

- zachowanie tej samej nazwy projektu Docker Compose,
- zachowanie nazw istniejących volume,
- zachowanie `.env`,
- zachowanie lokalnych override’ów,
- mniejsze ryzyko uruchomienia pustych baz pod innymi nazwami volume.

### 9.2. Inwentaryzacja przed migracją

W katalogu instalacji:

```bash
pwd
git status --short
git remote -v
git branch --show-current
git rev-parse HEAD
docker compose ls
docker compose ps
docker compose config --services
docker compose config --volumes
docker volume ls
```

Zapisać:

- katalog instalacji,
- aktualny commit,
- aktualną gałąź,
- nazwę projektu Compose,
- nazwy volume Postgres, ClickHouse, Redis i Caddy,
- używany profil `with-webserver` albo `--no-webserver`,
- aktualny `.env`,
- dodatkowe pliki compose/override,
- konfigurację reverse proxy.

### 9.3. Backup

Obowiązkowo:

```bash
mkdir -p ~/backup/rybbit-pre-fork-$(date +%F-%H%M%S)
BACKUP_DIR=$(ls -dt ~/backup/rybbit-pre-fork-* | head -1)

cp -a .env "$BACKUP_DIR/.env"
cp -a docker-compose*.yml "$BACKUP_DIR/" 2>/dev/null || true
cp -a Caddyfile "$BACKUP_DIR/" 2>/dev/null || true
git diff > "$BACKUP_DIR/local-working-tree.patch"
git rev-parse HEAD > "$BACKUP_DIR/git-head.txt"
git remote -v > "$BACKUP_DIR/git-remotes.txt"
docker compose config > "$BACKUP_DIR/docker-compose.resolved.yml"
docker compose ps > "$BACKUP_DIR/docker-compose-ps.txt"
```

Logiczny backup Postgres:

```bash
docker exec postgres pg_dumpall \
  -U "${POSTGRES_USER:-frog}" \
  > "$BACKUP_DIR/postgres-all.sql"
```

Dla ClickHouse i Redis należy wykonać snapshot zgodnie z aktualnym sposobem backupu serwera. Jeżeli nie istnieje gotowy mechanizm, bezpieczna metoda to krótki stop usług zapisujących i archiwizacja odpowiednich volume po odczytaniu ich nazw z `docker inspect`.

Przykład identyfikacji volume:

```bash
docker inspect postgres --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker inspect clickhouse --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
docker inspect redis --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

### 9.4. Zmiana remote

Zakładamy czyste working tree. Lokalne zmiany należy najpierw zapisać w osobnym branchu albo patchu.

```bash
git branch "backup/pre-wotcv-fork-$(date +%F)"

git remote rename origin upstream
git remote add origin https://github.com/WoT-CV/rybbit-wotcv.git

git fetch origin --prune
git fetch upstream --prune

git switch master
git branch --set-upstream-to=origin/master master
git merge --ff-only origin/master

git remote -v
```

Docelowo:

```text
origin   → WoT-CV/rybbit-wotcv
upstream → rybbit-io/rybbit
```

Nie wykonywać `git reset --hard` bez backupu i świadomej weryfikacji.

### 9.5. Krytyczna różnica: obrazy Docker

Samo przełączenie repozytorium nie wystarczy.

Obecny `docker-compose.yml` używa obrazów:

```text
ghcr.io/rybbit-io/rybbit-backend
ghcr.io/rybbit-io/rybbit-client
```

Obecny `update.sh` wykonuje `docker compose pull` i później uruchamia kontenery bez `--build`. W takiej konfiguracji serwer nadal uruchomi oficjalne obrazy upstream, a nie kod naszego forka.

### 9.6. Docelowa strategia obrazów

Rekomendowane obrazy:

```text
ghcr.io/wot-cv/rybbit-wotcv-backend:<tag>
ghcr.io/wot-cv/rybbit-wotcv-client:<tag>
```

Tagowanie:

- `sha-<pełny-lub-skrócony-commit>` — niezmienny tag konkretnego commita.

Nie wdrażać wyłącznie z ruchomego `latest`.

Aktualna decyzja operacyjna: podstawowy tryb serwera buduje backend i client bezpośrednio z gałęzi `feat/wotcv` za pomocą `scripts/wotcv-branch-build-deploy.sh`. Obrazy GHCR pozostają alternatywnym trybem wdrożenia po gotowym tagu SHA.

Na obecnym serwerze Compose musi działać z `COMPOSE_PROJECT_NAME=rybbit`, aby użyć istniejących volume `rybbit_*`. Port hosta Postgresa pozostaje konfigurowalny przez `HOST_POSTGRES_PORT`, a dla obecnej instalacji wynosi `127.0.0.1:5433:5432`.

### 9.7. Minimalizacja konfliktów compose

Zamiast mocno modyfikować upstreamowy `docker-compose.yml`, dodajemy overlay:

```text
docker-compose.wotcv.yml
docker-compose.wotcv.branch-build.yml
```

Przykładowo:

```yaml
services:
  backend:
    image: ghcr.io/wot-cv/rybbit-wotcv-backend:${IMAGE_TAG}

  client:
    image: ghcr.io/wot-cv/rybbit-wotcv-client:${IMAGE_TAG}
```

Polecenia wdrożeniowe używają overlay forka, a przy buildzie z gałęzi również overlay build:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  ...
```

Dzięki temu upstream może dalej aktualizować główny compose, a nasze różnice pozostają odizolowane.

### 9.8. Pierwsze wdrożenie

Przed uruchomieniem builda z gałęzi:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  config > /tmp/rybbit-wotcv-compose.yml
```

Zweryfikować:

- obrazy backend/client wskazują `ghcr.io/wot-cv`,
- volume mają te same nazwy co przed migracją,
- porty są niezmienione,
- `.env` został wczytany,
- `BASE_URL` i domena trackingu są niezmienione.

Uruchomienie:

```bash
bash scripts/wotcv-branch-build-deploy.sh
```

Weryfikacja:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  ps

curl -fsS http://127.0.0.1:3001/api/health

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  logs --since=10m backend client
```

### 9.9. Rollback instalacji

Rollback aplikacji w trybie build z gałęzi korzysta z ostatniego lokalnego obrazu zapisanego w `.wotcv-deployment.env`. Alternatywny rollback obrazów GHCR polega na zmianie `IMAGE_TAG` na poprzedni commit i ponownym uruchomieniu backend/client.

```bash
IMAGE_TAG=sha-POPRZEDNI_COMMIT docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  up -d --force-recreate backend client
```

Migracja `network_replay_config` musi być addytywna i zgodna wstecz, aby starszy obraz mógł działać po rollbacku.

---

## 10. Proces aktualizacji naszego forka względem upstream Rybbit

### 10.1. Model gałęzi

Rekomendowany model:

- `master` — gałąź synchronizowana z upstream Rybbit i utrzymywana bez rebase,
- `feat/wotcv` — gałąź, z której serwer buduje aktualny kod forka,
- `feature/wotcv-network-*` — funkcjonalności network replay,
- `chore/sync-upstream-YYYYMMDD` — każda aktualizacja z upstream.

Nie utrzymujemy `master` przez rebase. Nie force-pushujemy historii opublikowanej gałęzi.

### 10.2. Konfiguracja remote dewelopera

```bash
git remote -v

# jeśli brakuje upstream
git remote add upstream https://github.com/rybbit-io/rybbit.git

git fetch origin --prune
git fetch upstream --prune
```

### 10.3. Aktualizacja upstream — procedura

Do powtarzalnej aktualizacji `master` dodajemy skrypt:

```bash
bash scripts/wotcv-sync-upstream-master.sh
```

Skrypt wykonuje fetch `origin` i `upstream`, fast-forwarduje lokalny `master` do `origin/master`, tworzy backup branch i merguje `upstream/master` bez rebase. Push jest opcjonalny przez `WOTCV_PUSH=1`.

```bash
git switch master
git pull --ff-only origin master

git fetch upstream --prune

git switch -c chore/sync-upstream-$(date +%Y%m%d)
git merge --no-ff upstream/master
```

Po rozwiązaniu konfliktów:

```bash
npm ci
npm run build
npm run test:run
```

Uruchomić również testy client/shared zgodnie z aktualnymi skryptami repozytorium.

Następnie:

```bash
git push -u origin HEAD
```

Tworzymy PR do `master`, uruchamiamy CI i weryfikujemy wynik zgodnie z przyjętym pipeline’em.

### 10.4. Dlaczego merge, a nie rebase

Merge upstream:

- zachowuje czytelną historię pochodzenia zmian,
- nie przepisuje hashy naszych commitów,
- ułatwia rollback,
- nie wymaga force push,
- pozwala łatwo ustalić, do którego upstream SHA jesteśmy zsynchronizowani.

### 10.5. Ograniczanie konfliktów

Zasady:

1. Nowy kod WoT-CV umieszczać w nowych katalogach/pliku, gdy jest to możliwe.
2. Zmiany w upstreamowych plikach trzymać małe i punktowe.
3. Nie wykonywać niepotrzebnego formatowania całych plików.
4. Nie zmieniać nazw ani układu istniejących komponentów bez potrzeby.
5. Deployment utrzymywać w `docker-compose.wotcv.yml` i `scripts/wotcv-*`.
6. Prowadzić rejestr naszych odstępstw od upstream.

Rekomendowany dodatkowy dokument:

```text
docs/WOTCV_FORK_CHANGELOG.md
```

Powinien zawierać:

- listę funkcji WoT-CV,
- pliki zmienione względem upstream,
- migracje DB,
- znane miejsca konfliktów,
- ostatni zsynchronizowany upstream SHA.

### 10.6. Częstotliwość synchronizacji

- natychmiast po krytycznej poprawce bezpieczeństwa upstream,
- przed rozpoczęciem dużej nowej funkcji,
- regularnie co 2–4 tygodnie,
- nie odkładać aktualizacji przez wiele dużych wydań.

Mniejsze, częstsze merge są znacznie łatwiejsze niż jednorazowe nadrabianie wielu miesięcy.

### 10.7. CI wymagane przed merge upstream

Minimum:

- build server,
- build analytics script,
- build client,
- unit tests,
- testy parsera network,
- testy fetch/XHR instrumentation,
- uruchomienie migracji na pustej bazie,
- uruchomienie migracji na kopii schematu poprzedniej wersji,
- Docker image build,
- podstawowy smoke test `/api/health`,
- smoke test wczytania `/api/script.js` i `/api/replay.js`.

---

## 11. Pipeline obrazów WoT-CV

### 11.1. GitHub Actions

Dodać workflow:

```text
.github/workflows/build-wotcv-images.yml
```

Workflow:

1. checkout,
2. setup Buildx,
3. login do GHCR przez `GITHUB_TOKEN`,
4. build backend,
5. build client,
6. push tagów SHA,
7. zapis digestów obrazów w podsumowaniu joba.

### 11.2. Reprodukowalność

Deployment powinien używać konkretnego tagu SHA albo digestu.

Po wdrożeniu serwer musi umożliwiać ustalenie:

- commit SHA,
- image tag,
- image digest,
- czas wdrożenia.

Warto dodać do aplikacji lub health endpointu pola:

```json
{
  "version": "wotcv",
  "gitSha": "...",
  "buildTime": "..."
}
```

### 11.3. Dedykowany skrypt aktualizacji

Nie polegać bezpośrednio na obecnym `update.sh`, ponieważ:

- automatycznie wykonuje `git stash`,
- wykonuje zwykły `git pull`,
- pobiera oficjalne obrazy upstream,
- nie przypina konkretnego tagu,
- nie wykonuje kontrolowanego health check i rollbacku.

Dodać:

```text
scripts/wotcv-deploy.sh
scripts/wotcv-branch-build-deploy.sh
scripts/wotcv-server-audit.sh
scripts/wotcv-sync-upstream-master.sh
```

Skrypt `scripts/wotcv-deploy.sh` powinien:

1. wymagać czystego working tree,
2. odczytać oczekiwany `IMAGE_TAG`,
3. zapisać aktualny tag jako rollback tag,
4. wykonać `docker compose config`,
5. pobrać tylko backend/client,
6. uruchomić kontenery,
7. czekać na health check,
8. wyświetlić logi błędów,
9. w razie niepowodzenia automatycznie albo instrukcyjnie wrócić do poprzedniego tagu.

Skrypt `scripts/wotcv-branch-build-deploy.sh` powinien dodatkowo przełączać czyste repozytorium na `origin/feat/wotcv`, wykonywać wyłącznie fast-forward, budować backend/client lokalnie na serwerze i sprawdzać `/api/health` pod kątem `gitSha` oraz `imageTag`.

Skrypt `scripts/wotcv-server-audit.sh` powinien zebrać redagowaną konfigurację Git, Docker Compose, kontenerów, volume, portów i health checka, aby przed migracją można było ocenić realny stan serwera.

Skrypt `scripts/wotcv-sync-upstream-master.sh` powinien utrzymywać `master` łatwy do aktualizacji z oficjalnego Rybbit bez rebase i bez automatycznego pushowania.

---

## 12. Migracja `wot-cv-fe`

### 12.1. Obecny stan

`wot-cv-fe` posiada własną telemetrię requestów opartą o wrapper RTK Query.

Aktualnie generowane są eventy:

- `api_request`,
- `api_request_error`,
- `api_request_slow`.

Kod znajduje się głównie w:

- `src/rybbit/apiRequestTelemetry.ts`,
- `src/analytics/apiRequestTelemetry.ts`,
- `src/redux/baseQuery.ts`,
- odpowiadających testach.

Obecny wrapper:

- mierzy czas całej operacji RTK Query,
- zapisuje endpoint,
- normalizuje path,
- zapisuje status,
- zapisuje request i response body po własnej serializacji,
- generuje dodatkowe eventy dla błędów i wolnych requestów.

### 12.2. Co zapewni natywny network replay

Po implementacji network replay otrzymamy bez zmian w `wot-cv-fe`:

- każdy rzeczywisty fetch/XHR,
- pierwszą odpowiedź 401,
- request odświeżenia tokenu,
- ponowiony request po refreshu,
- realny czas każdego requestu osobno,
- request/response headers,
- request/response body,
- błędy sieciowe i aborty,
- korelację z kliknięciami, DOM i console errors.

To jest dokładniejsze niż obecny pojedynczy event tworzony wokół całej logiki base query.

### 12.3. Czego network replay nie zastępuje automatycznie

Network eventy zapisane w `session_replay_events` nie stają się automatycznie zwykłymi custom events w tabeli `events`.

Po usunięciu obecnych custom eventów możemy stracić przekrojowe analizy takie jak:

- liczba `api_request_error` dzień do dnia,
- wykres `api_request_slow`,
- funnel lub goal oparty na `api_request`,
- filtrowanie zwykłej analityki po properties tych eventów.

Dlatego przed usunięciem trzeba zrobić inwentaryzację dashboardów, goals, funnels i zapytań korzystających z tych nazw.

Domyślna decyzja projektu:

- jeżeli eventy służą wyłącznie do debugowania pojedynczych sesji — usuwamy je,
- jeżeli są używane do agregacji — albo pozostawiamy lekkie eventy bez body, albo w przyszłości budujemy derived analytics z network replay.

### 12.4. Migracja etapowa

#### Etap FE-1 — brak zmian funkcjonalnych

- FE nadal wysyła obecne custom eventy,
- tracker forka zaczyna nagrywać natywny network po włączeniu konfiguracji per site,
- oba źródła działają równolegle tylko podczas walidacji.

#### Etap FE-2 — porównanie

Dla kontrolnej próbki minimum 100 requestów porównać:

- URL,
- method,
- status,
- duration,
- request body,
- response body,
- błędy,
- request po refresh tokenu,
- request anulowany,
- request wolny,
- correlation/request ID, jeśli backend je zwraca.

Różnice opisać przed usunięciem starego kodu.

#### Etap FE-3 — usunięcie custom request telemetry

Po spełnieniu kryteriów:

1. usunąć importy z `src/redux/baseQuery.ts`,
2. usunąć `startedAt`,
3. usunąć `scheduleApiRequestTelemetry(...)`,
4. zachować całą logikę refresh tokenu i global error handling,
5. usunąć `src/analytics/apiRequestTelemetry.ts`,
6. usunąć `src/rybbit/apiRequestTelemetry.ts`,
7. usunąć odpowiadające testy,
8. wykonać globalne wyszukiwanie pozostałych referencji,
9. sprawdzić, że requesty RTK Query działają identycznie.

#### Etap FE-4 — zachowanie pozostałej integracji Rybbit

Nie usuwamy:

- skryptu Rybbit,
- konfiguracji hosta i site ID,
- identyfikacji użytkownika,
- business custom events,
- error telemetry niezwiązanej bezpośrednio z request wrapperem,
- pageview i SPA tracking.

### 12.5. Adres trackera

Jeżeli domena i reverse proxy pozostają bez zmian, `wot-cv-fe` nie musi wiedzieć, że backend pochodzi z forka.

FE nadal ładuje skrypt z tej samej domeny trackingowej. Zmienia się implementacja serwowana pod istniejącym URL-em.

### 12.6. Dokumenty prywatności

Surowy network capture może obejmować znacznie szerszy zakres danych niż obecne custom eventy.

Przed włączeniem surowego network capture trzeba przeanalizować i ewentualnie zaktualizować:

- data protection notice,
- politykę prywatności,
- opis retencji,
- podstawę prawną i zakres danych,
- dostęp administratorów do replay.

---

## 13. Plan PR-ów implementacyjnych

### PR 0 — dokumentacja

- ten plan,
- opis strategii forka,
- brak zmian runtime.

### PR 1 — konfiguracja i modele

- `NetworkReplayConfig`,
- Postgres JSONB migration,
- site config,
- tracking config,
- tracker config,
- toggle w dashboardzie,
- default disabled.

### PR 2 — core network recorder

- typy,
- body/header capture,
- fetch observer,
- XHR observer,
- unit tests,
- cleanup i restore patchy.

### PR 3 — PerformanceObserver i deduplikacja

- resource timing,
- initial resources,
- timing matching,
- testy deduplikacji.

### PR 4 — integracja rrweb i byte-aware batching

- plugin `rrweb/network@1`,
- integracja w `sessionReplay.ts`,
- byte-aware buffer,
- obsługa 413,
- testy ingest/query.

### PR 5 — parser i lista Network

- parse network events,
- typy client,
- zakładka Network,
- rows,
- filtry,
- seek do startu requestu.

### PR 6 — inspector i waterfall

- szczegóły,
- BodyViewer,
- timings,
- headers,
- raw,
- waterfall na timeline,
- aktywne requesty względem currentTime.

### PR 7 — deployment forka

- GHCR workflow,
- `docker-compose.wotcv.yml`,
- `scripts/wotcv-deploy.sh`,
- version metadata,
- dokumentacja migracji serwera.

### PR 8 — rollout i poprawki

- udostępnienie funkcji sterowanej per site,
- poprawki browser compatibility,
- dostosowania storage wynikające z decyzji właściciela instalacji.

### PR 9 — `wot-cv-fe` cleanup

- inwentaryzacja użycia custom events,
- usunięcie request telemetry, jeśli została zastąpiona,
- zachowanie business analytics,
- aktualizacja testów.

### PR 10 — pełna obsługa języka polskiego (ostatni etap prac)

- uzupełnienie polskiego katalogu tłumaczeń `client/messages/pl.json`,
- zachowanie wszystkich obecnych języków i istniejącego przełącznika języka,
- tłumaczenie nowych treści dashboardu, ustawień, Session Replay, Network Replay, autoryzacji, onboardingu i panelu administracyjnego,
- tłumaczenie komunikatów walidacji i błędów API, które są prezentowane użytkownikowi przez istniejące klucze i katalogi i18n,
- tłumaczenie wiadomości e-mail, pustych stanów, tooltipów, dialogów i komunikatów systemowych, jeśli są objęte katalogami i18n,
- ujednolicenie polskiej terminologii produktowej w katalogu `pl.json`,
- sprawdzenie, że polski katalog nie ma pustych kluczy ani niezamierzonych angielskich fallbacków.

Nazwy techniczne w kodzie, kontrakty API, identyfikatory eventów i logi niewidoczne dla użytkownika pozostają po angielsku.

---

## 14. Testy

### 14.1. Unit testy trackera

Fetch:

- GET bez body,
- POST JSON,
- FormData,
- URLSearchParams,
- Request object,
- custom headers,
- response JSON,
- response text,
- response 4xx,
- response 5xx,
- reject,
- AbortError,
- body over limit,
- body timeout,
- brak wpływu błędu instrumentacji na request.

XHR:

- GET,
- POST,
- request headers,
- text response,
- JSON response,
- blob/arraybuffer metadata,
- error,
- abort,
- timeout,
- listener cleanup.

Performance:

- matching fetch entry,
- matching XHR entry,
- brak entry,
- zasób statyczny,
- duplicate prevention,
- initial entries.

### 14.2. Unit testy parsera UI

- prawidłowy plugin event,
- wiele requestów w jednym payloadzie,
- niepełny request,
- nieznana version,
- błędny payload,
- sortowanie,
- start/end offset,
- status severity,
- pending state,
- replay bez networku.

### 14.3. Integracja backendu

- zapis i odczyt ClickHouse,
- zapis i odczyt R2,
- zachowanie dużego body,
- kolejność timestampów,
- delete replay,
- TTL bez zmian,
- backward compatibility.

### 14.4. E2E

Scenariusz testowy powinien wykonać:

1. wejście na stronę,
2. GET success,
3. POST JSON success,
4. response 400,
5. response 500,
6. wolny request,
7. abort requestu,
8. request z refresh token flow,
9. SPA navigation,
10. kliknięcie zmieniające DOM po odpowiedzi.

Po zakończeniu:

- otworzyć replay,
- sprawdzić kompletność requestów,
- sprawdzić timeline,
- sprawdzić seek,
- sprawdzić pending state,
- sprawdzić headers/body,
- porównać timestampy z DevTools.

### 14.5. Browser matrix

Minimum:

- Chrome,
- Edge,
- Firefox,
- Safari.

Szczególnie sprawdzić:

- `Request.clone`,
- `Response.clone`,
- ReadableStream,
- Resource Timing,
- CORS-exposed headers,
- XHR response types.

---

## 15. Kryteria akceptacji V1

Funkcja może zostać uznana za gotową po spełnieniu wszystkich punktów:

1. Co najmniej 95% kontrolnych fetch/XHR pojawia się w replay.
2. Brak duplikatów fetch/XHR z PerformanceObserver.
3. Start requestu na timeline różni się od DevTools o nie więcej niż 100 ms w typowym przypadku.
4. Duration jest zgodne z Performance API lub pomiarem wrappera.
5. Kliknięcie requestu przewija replay do właściwego momentu.
6. Podczas odtwarzania request ma stan pending między startem i końcem.
7. Headers i body są dostępne bez maskowania dla testowych requestów.
8. Błąd instrumentacji nigdy nie zmienia wyniku requestu aplikacji.
9. Brak pętli nagrywania endpointu ingest.
10. Brak nieograniczonego wzrostu bufora po HTTP 413.
11. Replay bez networku nadal działa.
12. Stare replay nadal się otwierają.
13. Wyłączenie konfiguracji zatrzymuje network capture bez redeploy FE.
14. Rollback do poprzedniego obrazu jest przetestowany.

---

## 16. Obserwowalność implementacji

Dodać techniczne liczniki/logi bez wypisywania przechwyconych body:

- liczba network events,
- liczba fetch/XHR/resource,
- liczba błędów capture,
- liczba body timeout,
- liczba body too-large,
- liczba eventów pominiętych przez limit,
- liczba requestów self-ingest pominiętych,
- liczba unmatched PerformanceResourceTiming,
- rozmiar batcha,
- odpowiedzi ingest 413,
- czas parsowania replay po stronie client.

Logi nie mogą zawierać surowych request/response body. Surowe dane mają być dostępne w replay, a nie przypadkowo duplikowane w stdout kontenerów.

---

## 17. Rollout

### Faza A — lokalnie

- testowa strona,
- syntetyczne endpointy,
- wszystkie unit i E2E.

### Faza B — integracja WoT-CV

- network replay jest sterowany konfiguracją per site,
- zakres aktywacji i konfigurację docelową ustala właściciel instalacji,
- porównanie z DevTools i starymi custom events.

### Faza C — stabilizacja

- poprawki wydajności,
- korekta limitów,
- decyzja o oddzielnym storage body,
- decyzja o usunięciu custom request telemetry z FE.

### Faza D — dynamiczne maskowanie

Osobny projekt po analizie realnych payloadów:

- maskowanie headers,
- maskowanie query params,
- maskowanie JSON keys,
- reguły per endpoint,
- allowlist/denylist,
- preview działania reguły,
- konfiguracja per site,
- testy zapobiegające wyciekowi danych.

### Faza E — bezpieczeństwo i prywatność

Zakres:

- wdrożenie maskowania,
- przegląd bezpieczeństwa,
- przegląd prawny i prywatności,
- ustalenie retencji,
- ograniczenie dostępu,
- akceptacja kosztu storage.

### Faza F — pełna obsługa języka polskiego

Jako ostatni etap prac uzupełniamy polski katalog tłumaczeń zgodnie z zakresem PR 10. Etap nie usuwa pozostałych języków i kończy się sprawdzeniem, że `client/messages/pl.json` jest kompletny.

---

## 18. Ryzyka i decyzje kontrolne

### Ryzyko: ogromny wzrost danych

Kontrola:

- limity body/event/batch,
- monitorowanie zużycia zasobów po stronie właściciela instalacji,
- sampling,
- późniejsze lazy loading.

### Ryzyko: wpływ wrappera na aplikację

Kontrola:

- clone,
- asynchroniczny odczyt,
- try/catch wokół instrumentacji,
- testy zachowania referencji i błędów.

### Ryzyko: pętla ingest

Kontrola:

- bezwarunkowe pomijanie requestów trackera przed capture.

### Ryzyko: konflikty z upstream

Kontrola:

- nowe katalogi,
- małe zmiany w istniejących plikach,
- compose overlay,
- regularny upstream merge,
- brak rebase master.

### Ryzyko: usunięcie użytecznych custom analytics z FE

Kontrola:

- inwentaryzacja dashboardów,
- shadow period,
- osobny PR cleanup,
- możliwość pozostawienia lekkich eventów agregacyjnych.

### Ryzyko: wdrożenie nadal używa upstreamowych obrazów

Kontrola:

- własne obrazy GHCR,
- overlay compose,
- wersja/commit widoczna w health,
- deployment po konkretnym tagu.

---

## 19. Definition of Done całego projektu

Projekt jest zakończony, gdy:

- fork posiada natywny recorder fetch/XHR/resource,
- network eventy są przechowywane w replay,
- UI pokazuje listę i waterfall,
- requesty są zsynchronizowane z playerem,
- dostępne są headers/body/timingi,
- V1 działa po włączeniu konfiguracji per site bez maskowania networku,
- istnieją limity techniczne i kill switch,
- obrazy WoT-CV są budowane i wersjonowane,
- instalacja serwerowa korzysta z forka, nie z upstreamowych obrazów,
- upstream remote i proces synchronizacji są udokumentowane,
- rollback jest przetestowany,
- decyzja o custom request events w `wot-cv-fe` została podjęta na podstawie danych,
- polski katalog tłumaczeń jest kompletny, a pozostałe obsługiwane języki pozostają dostępne,
- stare funkcje Rybbit i stare replay nie mają regresji.
