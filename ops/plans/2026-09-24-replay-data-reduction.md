# WoT-CV: kompletny plan dalszego odchudzania Replay bez podnoszenia limitów

Data: 2026-09-24. Status: projekt implementacji, nie raport z wykonania.

> **Zmiana zakresu zatwierdzona przez użytkownika 2026-09-24:** nie realizujemy
> prywatnego archiwum body ani fragmentacji/rekonstrukcji w Loki. Etap 1B oraz
> dotyczące go manifesty, receipts, viewer i provisioning są wyłączone, nie
> oczekują na wybór magazynu. Rozdziały opisujące te rozwiązania poniżej są
> historycznym projektem, nie instrukcją wdrożenia. Pozostały zakres realizujemy
> zgodnie z [bieżącym dziennikiem wykonania](2026-09-24-replay-data-reduction-execution.md).
> Duże body pozostaje jawnie pominięte w Loki; nie wolno na tej podstawie usuwać
> jego kopii full. Samo ID lub body_logged nie potwierdzają trwałego zapisu.

Ten dokument nie stanowi potwierdzenia gotowości aplikacji do produkcji.

Wynik wykonania oraz aktualne bramki wdrożenia:
[raport końcowy](replay-data-reduction-release-2026-09-24.md).
Historyczne kryteria poniżej, które wymagają archiwum, fragmentacji albo receipts,
nie obowiązują po powyższej zmianie zakresu. Odrzucenie prototypu formatu na
podstawie pomiarów jest poprawnym wynikiem etapu 5, nie brakiem jego realizacji.

## 1. Cel i kompletność zakresu

Zmniejszamy koszt przesyłania danych z `wot-cv-fe` do Rybbit. Usuwamy wyłącznie
potwierdzone duplikaty, zachowujemy unikalne dane przeglądarkowe i historyczne
nagrania. Nie zwiększamy żadnego istniejącego limitu, timeoutu, liczby retry,
retencji, bufora ani puli wykonawczej jako sposobu rozwiązania problemu.

Plan obejmuje wszystkie pięć wymaganych punktów, w zadanej kolejności:

| Wymaganie | Etap wykonawczy | Obowiązkowy rezultat |
| --- | --- | --- |
| R1. Kompletność HTTP w Grafanie | 1A–1C | Duże body dostępne przez Grafanę, jednoznaczne stany body, sprawdzone endpointy i cały OTel/Loki pipeline |
| R2. Dokładny zakres zastępowania | 2 | Wersjonowana macierz pól i usług; dowód zapisu konkretnej wymiany HTTP, nie sam correlation ID |
| R3. Ujednolicony rollout metadata | 3 | Ograniczenie pozostałego ruchu full tylko według zatwierdzonej polityki; bez przepisywania historii |
| R4. Bezstratna kompresja uploadu | 4 | Negocjowany gzip, odwracalność bajtowa, niezmienione limity logicznych danych i zachowanie retry |
| R5. Powtórzenia formatu | 5 | Zmierzony, wersjonowany codec transportowy bez zmiany odtworzonych danych |

Etap 0 przygotowuje pomiary i zabezpieczenia. Etap 6 zamyka całość testami,
własnym review i raportem gotowości. Nie zastępują one żadnego z pięciu wymagań.

## 2. Potwierdzony punkt wyjścia i granice dowodów

### Repozytoria

- `wot-cv-fe`, `develop`: `e5d822b9`; czyste drzewo przy przygotowaniu planu.
- `rybbit-wotcv`, `feat/wotcv`: `d6b623ec`; czyste drzewo przed dodaniem planu.
- `wot-cv-be`, `develop`: `6fe486d7`; istnieją cudze zmiany indeksu i drzewa
  `AD` dotyczące `ResourceTimingFilter.java` i `ResourceTimingFilterTest.groovy`.
  Nie włączać ich do commitów, nie przywracać ani nie usuwać.
- Nie zakładamy zmian w data-refresherze. Jeżeli inwentaryzacja wykaże potrzebę
  zmiany wspólnego kontraktu, robimy osobny podetap, bez połączenia
  data-refresher → BE REST i bez przenoszenia odpowiedzialności usług.

Kontrola SSH podczas przygotowania planu, 2026-09-24 12:08:39 UTC:
Rybbit zdrowy, SHA `d6b623ec6cfeb52fb9953875feedaa6a4f93ce2c`.
R2 nie jest skonfigurowane w działającym backendzie Rybbit. Nie oznacza to,
że sprawdzono wszystkie możliwe magazyny w całej infrastrukturze.

### Baseline z poprzedzającego audytu 24 września

Poniższe liczby odnoszą się do konkretnej próbki, nie do całego ruchu ani
gwarantowanego stanu przyszłego wdrożenia. Przed implementacją pomiar powtarzamy.

- Okno: 10:40:47.756–11:40:47.756 UTC; site 2; nowy tag FE `e5d822b9…`.
- Surowe JSON `event_data`: 21 021 280 B; snapshoty ok. 84,7%, zmiany rrweb
  ok. 14,3%, Network Replay ok. 1,0%. Nie są to zmierzone bajty HTTP uploadu.
- W próbce nowego metadata 49 requestów z correlation ID miało dopasowanie
  request/response w Loki. To dowód dla próbki, nie wszystkich endpointów.
- W próbce starego full 169 odpowiedzi zawierało body; 86 było identycznych
  z body znalezionym w Loki, dla 81 Loki pomijało duże body. Dwa pozostałe
  przypadki nie dały potwierdzenia. Nie można więc globalnie usuwać starych body.
- Eksperyment na pięciu snapshotach: 2 168 285 B → 343 720 B gzip,
  ok. 84,1% mniej. Pomiar wykonany na serwerze, nie na iPhonie i nie na całym
  produkcyjnym uploadzie. To przesłanka do etapu 4, nie obietnica oszczędności.

### Istotne fakty z kodu

- FE wymusza `data-replay-network-mode="metadata"`. Serwerowa konfiguracja
  tracking-config w audycie nadal zwracała full; stąd współistnienie generacji.
- `toMetadataRequest()` już usuwa body i mapy nagłówków, a zachowuje lekkie
  metadane, identyfikatory oraz pomiary przeglądarki. Nie wycinamy tego ponownie.
- Body w Logbook jest zastępowane markerem już przy `length >= 8192`.
  To długość Java String, nie liczba bajtów UTF-8.
- `HttpBodyLogMetadata` utożsamia blank z brakiem body i rozpoznaje pominięcie
  po treści markera. Whitespace oraz prawdziwe body o treści markera wymagają
  osobnego potraktowania.
- `ApiLogbookBodyLoggingFilter` ma cache requestu 64 KiB, nie sygnalizuje
  kompletności na podstawie samego cache, ma fallback `readAllBytes()` oraz
  buforuje odpowiedź przez `ContentCachingResponseWrapper`.
- Upload replay w `tracking.ts` wysyła JSON bez kompresji requestu.
- `recordSessionReplaySchema` nie deklaruje `sequenceNumber`, mimo że tracker
  je nadaje, a ingest potrafi je zapisać. Zod może usunąć je przed ingestem.
- `event_size_bytes` w ingest jest liczone przez długość JS string, nie UTF-8.
  Do benchmarku używamy rzeczywistych bajtów, nie tego historycznego pola.

## 3. Niezmienne zasady

1. Nie zmieniamy limitów, by ukryć brak kompletności albo uzyskać wynik testu.
2. Kompresja jest reprezentacją tych samych danych, nie pozwoleniem na większe
   body, batch, event lub większą liczbę zdarzeń.
3. Nie usuwamy DOM, snapshotów, mutacji, kliknięć, scrolla, inputu, błędów JS,
   zdarzeń biznesowych, identyfikacji użytkownika ani unikalnych Resource Timing.
4. Nie zmieniamy częstości snapshotów, samplingów ani maskowania dla oszczędności.
5. Nie usuwamy historycznych body, nie wykonujemy backfillu redukującego historię.
6. `correlationId`, `traceId`, odpowiedź HTTP 200 i brak alarmu eksportera nie są
   dowodem trwałego przechowania treści.
7. Polityka prywatności ma pierwszeństwo. Nie włączamy body/header capture
   użytkownikowi lub witrynie, które wybrały metadata. Brak danych już obecny
   z powodu tej decyzji musi być jawny, nie „naprawiony” tajnym zwiększeniem capture.
8. Dla nowego usuwania kopii wymagamy dowodu kompletności tej samej dozwolonej
   reprezentacji, dla konkretnego requestu/response, przez uzgodniony okres.
9. Nie obiecujemy odzyskania body, które wcześniej nie zostało zapisane nigdzie.
10. Nie obiecujemy dostarczenia po zabiciu przeglądarki ani exactly-once:
    bezstratność kodowania i niezawodność dostarczenia to różne właściwości.
11. Zmiana nie obejmuje merge branchy, upgrade zależności „przy okazji” ani
    automatycznego push/deploy. Wdrożenie jest osobną, kontrolowaną czynnością.

### Rejestr limitów do zamrożenia w etapie 0

| Warstwa | Zidentyfikowana wartość bazowa | Co sprawdzamy bez jej podnoszenia |
| --- | --- | --- |
| Logbook inline body | 8192 jednostki Java String; obecnie `>=` oznacza pominięcie | Wielobajtowe znaki, granice, jawne oddzielenie od archiwum |
| Cache requestu BE | 64 KiB | Overflow i nieodczytany request nie mogą udawać kompletności |
| OTel attribute value / count | 16384 / 512 w audycie | Efektywne ograniczenia dla logów, jednostki, SDK → Collector |
| Loki metadata / line | 64 KB / 256 KB w audycie | Suma zasobów i atrybutów, liczba atrybutów, odrzucenia |
| Network Replay body / event / batch | 1 000 000 / 2 500 000 / 7 000 000 B | Konfiguracja efektywna dla site, nie tylko default |
| Odczyt body w trackerze | 1000 ms | Brak wydłużania na potrzeby fallbacku |
| Replay retry | 3 próby | Fallback formatu nie dokłada ukrytych prób |
| Fastify replay request | 10 × 1024 × 1024 B | Ten sam limit po dekompresji; osobno canonical payload |
| Retencja replay/Loki/Tempo | W audycie po 30 dni; Tempo ma override | Efektywne override, moment startu TTL i realna dostępność |
| Nginx, Collector, kolejki, RAM, CPU, dysk | Pełna inwentaryzacja przed implementacją | Żadnego zwiększania istniejących budżetów |

Wartości z audytu nie zastępują odczytu konfiguracji runtime przed danym etapem.
Nowy komponent musi mieć jawny, ograniczony budżet mieszczący się w zaakceptowanych
zasobach. Brak takiego budżetu blokuje jego aktywację, nie upoważnia do powiększania
dysku, RAM, limitów rate ani kolejek.

## 4. Decyzja architektoniczna: duże body

Rekomendacja do zatwierdzenia przed etapem 1B: prywatne archiwum HTTP z małymi
odnośnikami w Loki i czytnikiem dostępnym z Grafany. Body nie musi mieścić się
w atrybucie OTel ani pojedynczym wpisie Loki. Podgląd body w Grafanie oznacza
w tym wariancie przejście do autoryzowanego czytnika, nie automatyczne wklejenie
całej treści do Explore.

Nie znaleziono skonfigurowanego R2 w runtime Rybbit. Etap 0 ma ustalić istniejący
prywatny magazyn i dostępny budżet. Dla persistent filesystem wymagamy protokołu
atomicznego zapisu obiektu i manifestu, synchronizacji trwałego zapisu oraz testu
odtworzenia. Dla prywatnego object storage weryfikujemy semantykę commit/readback
i lifecycle. Sam zapis do `/tmp`, RAM albo asynchronicznej kolejki nie wystarczy.

### Co jest kompletne

Kompletność dotyczy zdefiniowanej, dozwolonej reprezentacji HTTP, np. tekstu
odpowiedzi JSON po dekodowaniu, z identyczną polityką redakcji. Nie utożsamiamy
jej z surowymi pakietami TLS ani z całym nieograniczonym strumieniem.

- Nie nazywamy prefixu pełnym body.
- Nie uznajemy JSON po parse/stringify za bajtowo identyczny z oryginalnym tekstem.
- Nie mylimy skompresowanej długości HTTP z długością zdekodowanego body.
- Archiwizacja większej treści nie polega na zwiększeniu cache requestu ani
  `max-length` Logbook: wymaga ograniczonego bufora i kontrolowanego zapisu poza nim.
- Proponowany zakres pierwszego wdrożenia archiwum: skończone JSON/text do
  aktualnie dozwolonej wielkości body Replay dla danej polityki (w baseline
  1 000 000 B), nie dowolnie duże obiekty. To nowy kontrakt archiwum, nie zmiana
  limitu Logbook. Bufory I/O i sumaryczna pamięć muszą zmieścić się w istniejącym
  budżecie; zweryfikować jednostki i dotychczasową semantykę truncation.
- Obsługę body mieszczących się w dotychczasowym kontrakcie Replay projektujemy
  w pierwszej kolejności. Wielkości ponad zatwierdzony budżet, niekończące się
  strumienie i formaty wyłączone przez politykę dostają jawny stan, nie obietnicę
  pełnego zapisu. Jeżeli wymagany endpoint przekracza te granice, nie dopuszczamy
  dla niego usuwania kopii; konflikt zakresu i zasobów musi być rozstrzygnięty.

### Model potwierdzenia i awarie

Każda wymiana dostaje server-generated `exchangeId`; correlation ID pozostaje
kluczem wyszukiwania i może być powtórzony, więc nie jest kluczem unikalnym.
Manifest rozróżnia request i response, origin, usługę, środowisko, metodę, czas,
wersję polityki oraz identyfikator reprezentacji. Dla każdej strony przechowuje:

- stan przechwycenia: `empty`, `captured`, `omitted`, `partial`, `unknown`;
- powód: m.in. `privacy`, `unsupported_content_type`, `limit`, `unread_request`,
  `client_abort`, `capture_failed`, `storage_failed`;
- stan przechowania: `pending`, `committed`, `failed`, `expired`;
- docelowe miejsce, object ID, content type/charset, liczbę zaobserwowanych
  i zapisanych bajtów, hash dozwolonej reprezentacji, deadline dostępności;
- osobną informację o redakcji. `complete` znaczy kompletne względem tej
  konkretnej polityki, nie „niezredagowane”.

W UI główne opisy: „body puste”, „body zapisane”, „body pominięte”;
przypadki częściowe, oczekujące, wygasłe i nieznane mają dodatkowe jednoznaczne
opisy. `empty` wymaga obserwacji końca pustej treści lub semantyki HTTP.
Brak pola i tekst składający się z whitespace nie oznaczają pustego body.

`committed` nadaje właściciel archiwum dopiero po trwałym zapisie i walidacji
kompletności. Logbook nie może ustawić go wyłącznie po dodaniu MDC.
OTel/Loki ma osobny stan widoczności: utrata logu nie może unieważnić możliwości
odnalezienia manifestu po `exchangeId` w autoryzowanym czytniku.

Dla ścisłego usuwania kopii klient musi otrzymać wiarygodne potwierdzenie danej
wymiany. Dla ograniczonych, skończonych odpowiedzi JSON można przygotować pełną
odpowiedź w ograniczonym spoolu, zatwierdzić body/manifest, dodać mały receipt
i dopiero zwolnić odpowiedź. Wpływ na TTFB i dysk wymaga testu; nie stosować
globalnie do streamów. Receipt nie jest tokenem dostępu do treści.

Jeśli receipt powstaje dopiero po wysłaniu nagłówków, nie udajemy, że można go
wpisać do już wysłanej odpowiedzi. W takim wariancie potrzebna jest późniejsza
weryfikacja i zatrzymanie dotychczasowej kopii do potwierdzenia. Bez tego endpoint
nie jest dopuszczony do ścisłego trybu usuwania kopii. Nie dokładamy zapytania
z FE do Grafany dla każdego requestu.

| Sytuacja | Usuwanie dostępnego body z nowego uploadu |
| --- | --- |
| Receipt zgodny z wymianą, kompletne body, zgodna retencja i polityka | Dozwolone tylko dla pól objętych potwierdzeniem |
| Jest correlation/trace ID, brak potwierdzenia | Niedozwolone |
| Brak body zgodny z HTTP i jawnie potwierdzony | Nie tworzymy sztucznego body |
| Archiwum niedostępne, pełna kolejka, brak dysku, odczyt przerwany | Brak potwierdzenia; dotychczasowy dozwolony fallback |
| Privacy cap metadata zabrania capture | Nadal bez body; jawna luka, bez potajemnego fallbacku full |
| Brak requestu na BE: sieć, CORS, abort, proxy/CDN | Nie uznajemy danych przeglądarki za zastąpione logiem BE |
| Stare nagranie z full | Body pozostaje w historii niezależnie od aktualnego stanu archiwum |

Twarda granica: fail-open aplikacji + nieograniczone awarie magazynu + brak
buforowania po stronie klienta nie dają gwarancji zachowania każdego body.
Plan jej nie deklaruje. Dla nowych redukcji obowiązuje fail-closed decyzji
o usunięciu kopii, nie blokowanie działania biznesowego aplikacji.

### Wariant bez dodatkowego magazynu

Jeżeli archiwum zostanie odrzucone, etap 1B nie znika. Zastępuje go osobno
zatwierdzony wariant multipart w istniejącym Loki: małe fragmenty poniżej
obecnych limitów, ograniczona liczba fragmentów, `exchangeId`, kierunek,
indeks/liczba części, hash, manifest i autoryzowany składacz treści.

Warunkiem jest wykazanie zapasu w istniejących limitach rate/queue/storage,
odnalezienie wszystkich części po eksporcie oraz obsługa brakujących fragmentów.
Sam manifest wysłany do Loki nie dowodzi, że wszystkie części zostały przyjęte.
Query limit i paginacja też nie mogą ukrywać brakujących części. Składanie jest
ograniczone istniejącym budżetem body; bez body lub ID w indeksowanych labels.
To wariant o większym narzucie wpisów i trudniejszym potwierdzeniu trwałości,
dlatego nie jest rekomendowany. Jeżeli nie mieści się w obecnych zasobach,
redukcja body jest zablokowana, a nie wymuszana podniesieniem limitów.

## 5. Stały cykl pracy i commitowania

Dla etapu 0, każdego podetapu 1A–1C i etapów 2–6:

1. Ponownie odczytać aktualny kod, SHA, dirty tree, konfigurację i wyniki
   poprzedniego etapu. Zweryfikować, czy założenia nadal obowiązują.
2. Przed zmianami dopisać szczegółowy plan wykonawczy etapu: konkretne pliki,
   kontrakty wejścia/wyjścia, kolejność zmian, testy negatywne i rollback.
3. Implementować tylko ten zakres. Zmianę wymagającą nowej decyzji najpierw
   opisać, nie przemycać jej do innego etapu.
4. Wykonać testy jednostkowe, kontraktowe i integracyjne adekwatne do ryzyka.
5. Własne review całego diffu: dane, błędy, uprawnienia, wydajność, limity,
   kompatybilność, utrzymanie i scenariusze rollbacku.
6. Każdy znaleziony problem poprawić, dodać regresję i powtórzyć walidację.
7. Przejrzeć dokładnie indeks, a następnie utworzyć commit z nazwą etapu.
   Commit per zmienione repo; żadnych pustych commitów w nietkniętych repo.
8. Zapisać SHA, wykonane komendy, wyniki i ograniczenia. Dopiero wtedy następny
   etap. Cross-repo release manifest łączy powiązane SHA.

Conventional Commits; małe, spójne zmiany. Nie używać `git add .` w brudnym
repo BE. Zastane staged zmiany też nie należą do tego zadania; commitowanie
wymaga odizolowania zakresu bez naruszenia indeksu użytkownika. Jeśli nie da się
tego bezpiecznie zrobić, zatrzymać commit, nie zabierać zmian użytkownika.
Nie usuwać starszych readerów przy wyłączeniu nowego writera.

## 6. Etap 0 — baseline, granice i scenariusze

### Ponowna analiza

Sprawdzić trzy repo, wersje publicznego skryptu/FE/backendów oraz aktualny site
tracking-config. Przeczytać obowiązujące instrukcje repo. Java/Groovy dopiero po
odczytaniu pełnego `NordaSolutionsCodeStyle.xml`. Ustalić rzeczywiste pochodzenie
requestów oraz dostępne zasoby archiwum, bez odczytu sekretów do raportu.

### Implementacja przygotowania

- Wersjonowany, pozbawiony danych osobowych fixture corpus: JSON/text,
  whitespace, puste body, Unicode, request/response, błędy, duży snapshot,
  network full/metadata, stare nagrania, mieszane eventy rrweb.
- Syntetyczne próby przy granicach 8192, 64 KiB, body/event/batch/ingress;
  osobno jednostki znakowe i bajty. Realne body nie trafiają do Git.
- Skrypt audytu efektywnych limitów i porównania before/after, wyjście wyłącznie
  allowlistowanych wartości; bez `.env`, cookie, authorization i body.
- Mierniki: UTF-8 canonical JSON, HTTP entity bytes, retransmisje, CORS overhead,
  czas serializacji/kompresji p50/p95/p99, main-thread long tasks, heap,
  koszt backendu, kolejki oraz błędy odtwarzania. Oddzielne grupy wersji FE.
- Macierz endpointów: route template + metoda + status/content type; rejestracja,
  auth/refresh, konta, dane klanów/graczy, listy, endpointy zarządzania i duże
  odpowiedzi. Próby mutujące tylko na stagingu i syntetycznych kontach.
- Potwierdzić politykę retencji i miejsce archiwum. Zamrozić progi akceptacji
  wydajności przed zmianą; nie poprawiać ich po zobaczeniu niekorzystnego wyniku.

### Testy, review i odbiór

Powtarzalne wyniki na tych samych fixture'ach, brak sekretów w artefaktach,
aktualny rejestr limitów, jawna decyzja magazynu i endpointów. Brak dostępnego
magazynu nie zatrzymuje opisania pozostałych etapów, ale blokuje aktywację
redukcji wymagającej takiego dowodu. Rollback: usunięcie samych narzędzi
pomiarowych bez zmian produkcyjnych.

Commit: `test(observability): redukcja etap 0 - baseline i granice danych`.

## 7. Etap 1A — prawdziwy stan przechwycenia HTTP

### Ponowna analiza

Prześledzić filter ordering, Logbook, MDC, security rejection, servlet async,
response commit i źródło rozmiarów. Nie polegać na treści markera ani wyłącznie
na `Content-Length`, który może nie istnieć lub opisywać inną reprezentację.

### Pliki i implementacja

W `wot-cv-be`:

- `api-shared/.../filter/ApiLogbookBodyLoggingFilter.java` oraz testy filtra;
- `observability/.../logging/HttpBodyLogMetadata.java`;
- `LogbookBodyFilter.java`, `LogbookMdcAttributeWriter.java`,
  `LogbookMdcAttributeNames.java`, `MdcDelegatingSink.java` i ich testy.

Zmiany:

1. Typowany model stanów request/response zgodny z rozdziałem 4. Zachować stare
   atrybuty w okresie kompatybilności, dodać jednoznaczne nowe pola.
2. Rozróżnić zero bajtów, nieodczytane body, whitespace, częściowy cache,
   redakcję, typ wyłączony i błąd przechwycenia.
3. Usunąć nieograniczone `readAllBytes()` z fallbacku. Nie konsumować dodatkowo
   body odrzuconego requestu tylko dla logów. Nie zakłócać odczytu kontrolera.
4. Sygnalizować overflow cache; nie zwiększać 64 KiB. Przygotować interfejs
   strumieniowego capture/spoolu dla etapu 1B, bez nieograniczonej kolejki.
5. Zabezpieczyć flush/copy/cleanup, wyjątki oraz ponowne dispatch. Odpowiedź
   biznesowa musi zachować status, nagłówki i treść mimo awarii telemetrii.
6. Nie budować wielkich MDC. Sekrety redagować przed eksportem/archiwizacją:
   cookie, set-cookie, authorization, hasła, tokeny, reset/session secrets.
   Redakcja ma jawny kontrakt; nie wycinać wszystkich pól biznesowych.

### Testy i odbiór

Granice 8191/8192/8193 jednostek, wielobajtowy UTF-8, dokładnie 64 KiB i overflow,
chunked, brak długości, blank, prawdziwe `BODY_WAS_TOO_LONG`, JSON scalar,
`application/*+json`, content type z parametrami, ZIP, multipart, HEAD/204/304,
4xx security, 5xx, wyjątek filtra, client abort, SSE i async dispatch.

Warunek: żaden niepusty/przerwany/nieodczytany request nie jest fałszywie oznaczony
jako pusty lub kompletny; odpowiedź aplikacji bez regresji; limity niezmienione.
Review obejmuje kolejność filtrów, MDC cleanup, duplikaty logów i pamięć.
Rollback: wyłączenie nowego capture, ale bez przywracania błędnego oznaczania
niekompletnych body jako kompletnych.

Commit: `fix(observability): redukcja etap 1A - jawna kompletnosc HTTP`.

## 8. Etap 1B — duże body bez zwiększania limitów

### Ponowna analiza

Zatwierdzić wariant z rozdziału 4, zasoby, retencję, zakres content types i
bezpieczeństwo. Zmierzyć rozkład wielkości, również odpowiedzi z cache/proxy
oraz błędów. Sprawdzić, czy zapis kończy się przed momentem potrzebnym receipt.

### Implementacja rekomendowana

1. Wprowadzić mały interfejs archiwum w BE i adapter do zatwierdzonego magazynu.
   Nie dodawać zależności do Rybbit na krytycznej ścieżce biznesowej.
2. Ograniczony capture/spool zamiast pełnego bufora RAM; streamy, pliki i async
   poza trybem potwierdzanego zastępowania do czasu osobnej weryfikacji.
3. Archiwizować dozwoloną reprezentację i manifest. Jeżeli pełna trwałość ma
   uzasadniać usunięcie kopii, także małe body wymagają trwałego źródła lub
   potwierdzonego Loki, nie tylko wywołania Logbook.
4. Atomowy publish manifestu po ukończeniu obiektu; hash i długość muszą się
   zgadzać. Incomplete spool nigdy nie dostaje `committed`.
5. Mechanizm restart/recovery i cleanup niedokończonych obiektów; ograniczona
   kolejka z backpressure. Brak zasobów = jawny błąd zapisu, nie nieograniczony RAM.
6. Mały, wersjonowany receipt dla kwalifikowanych odpowiedzi; wiąże exchange,
   kierunki, politykę, stan oraz retencję. Autentyczność potwierdza właściciel
   archiwum; receipt z payloadu replay nie jest zaufanym dowodem sam w sobie.
7. TTL liczony spójnie z nagraniem. Body musi być dostępne co najmniej przez
   okres, dla którego obiecujemy zastępstwo, bez zwiększania aktualnej retencji.
   Jeżeli nagranie ma indywidualną dłuższą retencję, nie kwalifikuje się do usunięcia
   tej kopii bez osobnej decyzji. Zapis `expiresAt` musi zgadzać się z lifecycle.
8. Kontrola dostępu, szyfrowanie zgodne ze standardami wdrożenia, audyt odczytu,
   ograniczenie cross-environment i cross-tenant. Nie używać correlation ID jako
   sekretu ani publicznego klucza dostępu. Brak długowiecznych signed URL w logach.
9. Trwałość w ustalonym modelu awarii potwierdzić restartem i testem odtworzenia.
   Nie deklarować odporności na utratę hosta bez odpowiedniego backupu/magazynu.

### Testy i odbiór

Duże request i response ponad próg Logbook, wielobajtowe treści, limit capture,
hash mismatch, przerwany upload, timeout zapisu, brak miejsca, restart w środku
commit, ponowny request z tym samym correlation ID, brak uprawnień, wygaśnięcie.
Sprawdzić odzyskanie dokładnej dozwolonej treści, nie tylko istnienie obiektu.

Warunek: obowiązkowe endpointy mają kompletną treść w zatwierdzonym zakresie;
brak false-positive `committed`; brak pogorszenia działania aplikacji i limitów.
Brak rozwiązania dużego body blokuje R1 — sama etykieta „pominięto” nie zalicza
tego etapu. Rollback wyłącza nowe zapisy/receipts, nie usuwa zachowanych obiektów.

Commit: `feat(observability): redukcja etap 1B - archiwum duzych body`.

## 9. Etap 1C — Grafana, pipeline i dostęp do treści

### Ponowna analiza

Odczytać efektywną konfigurację SDK, Collector, Loki, Tempo i provisioningu.
Sprawdzić liczbę i rozmiar atrybutów wraz z resource attributes. Sam limit jednej
wartości OTel nie chroni przed przekroczeniem sumy metadata Loki.

### Implementacja

- Małe logi request/response z ID, stanami, rozmiarami, powodem i odnośnikiem
  do archiwum. Duże body nie jest kopiowane do atrybutu OTel jako obejście limitu.
- Endpoint/czytnik wyłącznie dla uprawnionych operatorów; body jako bezpieczny
  tekst, bez wykonywania HTML, automatycznych zewnętrznych requestów i wycieku
  w URL. Kontrola dostępu niezależna od publicznych/private-share linków Rybbit.
- Provisioning Grafany: link z logu do czytnika body i istniejące log↔trace.
  Zweryfikowane identyfikatory konfiguracji: Grafana `dashboard.wot-cv.com`,
  org 1, Loki `bet3mn133whkwd`, Tempo `df0rqhtz9e3uoa`. Zweryfikować je ponownie
  przed wdrożeniem; tokeny/dostępy nigdy w FE ani w repo.
- Widoczność brakujących, częściowych i wygasłych danych; brak logu i brak body
  to osobne przypadki. Viewer może odszukać manifest nawet przy utracie logu.
- Metryki capture, archive commit/fail, OTel drops/refusals, Loki discard reasons,
  queue saturation, archive read failures i niezgodności retencji. Bez ID,
  pełnych URL czy użytkowników jako wysokokardynalnych labels.
- Stagingowy test end-to-end przez rzeczywiste wersje SDK → Collector → Loki;
  potwierdzenie obecności i odczytu. Sprawdzić restart i opóźnienie eksportu.

### Testy, review i odbiór

Puste/zapisane/pominięte body widoczne w UI, duże body dostępne z linku,
403 bez uprawnień, brak cross-tenant odczytu, poprawne escaping i redakcja,
utrata wpisu logu bez utraty możliwości odczytu manifestu. Wymagane endpointy
testowane na wszystkich istotnych klasach odpowiedzi, nie tylko happy path.
Limity OTel/Loki pozostają identyczne. Rollback usuwa linki/nowe eksporty,
pozostawia archiwum i jego reader do końca zobowiązanego okresu.

Commit: `feat(observability): redukcja etap 1C - Grafana i dowody zapisu`.

## 10. Etap 2 — kontrakt zastępowania danych

### Ponowna analiza

Użyć wyników etapu 1, a nie samej domeny lub deklaracji konfiguracji. Porównać
semantykę pól z przeglądarki i serwera, w tym proxy, cache, redirect i redakcję.

### Macierz zakresu

| Źródło | Zasada zastępowania |
| --- | --- |
| `api.wot-cv.com`, kwalifikowane route/method/content type | Tylko pola z potwierdzeniem tej wymiany i zgodną reprezentacją |
| Własne API odrzucone przez proxy, abort, CORS, network error | Brak domniemania zapisu w BE; zachowanie dotychczasowych danych przeglądarki |
| Inne własne usługi, np. chat | Osobny właściciel, pipeline, identyfikator i dowód; brak automatycznego dziedziczenia profilu BE |
| `wot-cv.com`, statyki, CDN, Service Worker, cache | Dane serwera nie zastępują obserwacji przeglądarki |
| Zewnętrzne originy, fonty, zasoby WG | Nie deklarujemy pokrycia Grafaną WoT-CV; brak dalszego usuwania danych |

Nie oznacza to automatycznego ponownego włączenia body dla źródeł, które już są
w metadata. Audyt ma pokazać istniejące luki, a nowa redukcja nie może ich zwiększać.

### Implementacja

1. Wersjonowany kontrakt w `shared`, policy resolver po dokładnym origin
   (scheme/host/port), route, metodzie i stronie request/response.
   Zero `includes("wot-cv")`, wildcard suffix lub zaufania do redirectu.
2. Osobna kwalifikacja body, request headers, response headers i parametrów URL.
   Zapis body nie potwierdza nagłówków, a BE nie zna fragmentu URL ani każdego
   nagłówka zmienionego przez proxy. Nie wycinać ich zbiorczo.
3. Potwierdzenie wiąże exchange ID, czas, usługę, środowisko, wersję polityki
   i strony wymiany. Powtórzony correlation ID i same 32 znaki trace nie wystarczą.
4. Rozdzielić konfigurację capture/privacy, zakres coverage i transport codec.
   Metadata privacy cap nigdy nie może zostać rozluźniony przez coverage.
5. Zostawić lekki aktualny zestaw: request ID, URL w obecnej bezpiecznej postaci,
   method, initiator, status/outcome, znaczniki czasu, duration, rozmiary,
   timing, correlation/trace. BE duration nie zastępuje browser timing.
6. Wyraźny stan pokrycia `verified`, `unknown`, `unavailable`, `expired`,
   `not_applicable`. Link do Grafany może istnieć przy `unknown`, ale UI nie
   opisuje go jako potwierdzonego pełnego zapisu.
7. Contract tests umieścić w `shared` albo testach integracyjnych, nie importować
   `server/src` z klienta. Walidacja runtime dla niezaufanych danych obowiązkowa.

### Pliki, testy i odbiór

`shared/src/networkReplay.ts`, `networkReplayMetadata.ts`, `networkCorrelation.ts`,
`replayObservability.ts`; `server/src/lib/networkReplayConfig.ts`;
`server/src/analytics-script/config.ts`; `client/src/components/replay/network/`.

Testy tabelaryczne każdej reguły, brak ID, collision ID, fake receipt,
zła usługa/site/env, redirect, opaque response, 401/403/5xx, Unicode i stare
eventy. Pola bez równoważnego źródła zostają. Review zawiera test dowodu,
nie tylko test generowania URL. Rollback: coverage disabled bez utraty readerów.

Commit: `feat(observability): redukcja etap 2 - kontrakt pokrycia danych`.

## 11. Etap 3 — rollout metadata i pozostający ruch full

### Ponowna analiza

Ponownie zmierzyć proporcje tagów FE, trybów i źródeł. Ustalić, które stare
klienty pobierają konfigurację raz, jaki mają cache skryptu i jak kończą sesję.
Zmiana serwerowego ustawienia nie zmienia kodu już uruchomionej karty.

### Implementacja

1. Reader-first: obsługa nowych stanów i kontraktu, potem writer. Zachować
   parser starych plugin payloadów i fallback ID z historycznych nagłówków.
2. Dla nowego FE pozostawić lekki metadata. Nie włączać automatycznie full
   przy błędzie archiwum, ponieważ złamałoby to aktualny privacy cap.
3. Pozostałych klientów full przenieść na politykę coverage-aware wyłącznie
   tam, gdzie zaprojektowano potwierdzenie zapisu. Do czasu potwierdzenia
   istniejąca dozwolona kopia zostaje w dotychczasowych limitach capture.
4. Dla response z wiarygodnym receipt można pominąć clone/read body. Dla
   request body po rozpoczęciu fetch nie zawsze da się odtworzyć oryginalny
   stream: kwalifikację i zatrzymanie fallbacku zaprojektować przed wysłaniem.
   Brak bezpiecznej możliwości = brak tej optymalizacji, a nie utrata danych.
5. Nie dołączać domyślnie nowych request headers powodujących dodatkowe
   preflighty. Receipt z response wymaga jawnej, wąskiej ekspozycji CORS.
6. Ujednolicić wersję i znaczenie site config oraz atrybutu skryptu. Pełnego
   ustawienia site nie zastępować globalnym metadata dla niezweryfikowanych
   źródeł tylko po to, by pozbyć się starego ruchu.
7. Stary tracker nadal może wysłać full. Nie odrzucać całego uploadu i nie
   uznawać serwerowego oczyszczenia payloadu za oszczędność transferu FE.
   Redukcja transferu zaczyna się po uruchomieniu nowego writera.
8. Nowe uploady oczyszczać tylko według zweryfikowanego kontraktu; receipt od
   klienta wymaga weryfikacji serwerowej, nie samego `bodySaved: true`.
9. UI: zachować odtwarzanie i wyświetlanie starych body. Stan oraz linki do
   Grafany nie mogą zamykać modala Replay, propagować click do row-close,
   otwierać nieautoryzowanych danych ani zmieniać pozycji odtwarzania.
10. Osobna telemetria full/metadata/fallback według wersji, bez treści i wysokiej
    kardynalności ID. Nie wymuszać przeładowania aktywnej sesji użytkownika.

### Testy, review i odbiór

Macierz stary/nowy FE × stary/nowy tracker × config full/metadata/coverage-aware
× archiwum zdrowe/awaria × znany/nieznany origin. Testy Request, fetch/XHR,
abort, streamy, odświeżenie auth, unload i mieszane wersje w jednej historii.

Mierzona redukcja starych uploadów bez nowej luki; nie ma usuwania historii.
Stare otwarte karty są jawnie raportowane, nie traktowane jako błąd endpointu.
Rollback wyłącza nowe odrzucanie kopii, ale nie podnosi capture ponad poprzednią
zgodę użytkownika i nie odzyskuje już utraconych danych.

Commit: `feat(replay): redukcja etap 3 - rollout metadata bez utraty historii`.

## 12. Etap 4 — bezstratna kompresja uploadu Replay

### Ponowna analiza

Prześledzić cały request od serializacji przez CORS/Nginx/Fastify do ClickHouse
lub R2 oraz retry/split. Zweryfikować aktualny format batcha, identity snapshot
i sequence number; przeprowadzić benchmark na prawdziwym iPhonie.

### Implementacja

1. Najpierw route-scoped obsługa `Content-Encoding: gzip` po stronie Rybbit,
   przed JSON parserem; identity JSON nadal obsługiwany. Nie zmieniać globalnie
   pozostałych endpointów Fastify ani nie używać response compression pluginu
   jako rzekomej kompresji uploadu.
2. Negocjacja możliwości w istniejącym tracking-config: wersja transportu i
   wspierane encodings. Brak deklaracji oznacza zwykły JSON.
3. Strumieniowe rozpakowanie z niezmienionym limitem skompresowanego wejścia
   i limitem wyjścia. Rozmiar canonical batch po ewentualnym decode również
   podlega dotychczasowym limitom. `receivedEncodedLength` uwzględnia liczbę
   bajtów z sieci, nie liczbę bajtów po rozpakowaniu.
   Sprawdzenie canonical rozmiaru po v2 nie może zaczynać się od nieograniczonej
   alokacji rozwiniętego obiektu: ekspansję budżetować w trakcie dekodowania.
4. Zabezpieczenia: truncated gzip, CRC/ISIZE, nieobsługiwany encoding,
   uszkodzony JSON, dodatkowe składowe gzip, decompression bomb, slow input,
   client disconnect, konkurencyjne uploady. Nie pozostawiać zawieszonego
   strumienia ani alokacji po odpowiedzi 4xx.
5. W trackerze `CompressionStream("gzip")` tylko przy wsparciu przeglądarki
   i serwera. Serializacja raz; body jako bajty/Blob, bez base64. Progi dla
   małych batchy wybrać z pomiaru; jeśli gzip nie zmniejsza danych, wysłać JSON.
6. Brak API/awaria kompresji przed wysłaniem = identity JSON. 415 może umożliwić
   jeden kontrolowany downgrade w ramach tego samego budżetu prób, tylko gdy
   serwer gwarantuje odrzucenie przed ingestem. Timeout/5xx/utrata ACK nie
   upoważniają do natychmiastowego wysłania drugiej wersji tego samego batcha.
7. Zachować kolejność, sekwencje, identity snapshot, retry max 3 i ordered split
   po 413. Podział według logicznych eventów, nie fragmentów gzip. Nie wrzucać
   większego batcha dlatego, że po kompresji mieści się na wejściu.
8. Poprawić zachowanie `sequenceNumber` w walidacji i testować ingest od końca
   do końca. Nie opierać unikalności wielu kart na samym first timestamp/sequence.
   Nie deklarować exactly-once, którego obecny pipeline nie gwarantuje.
9. Nie dodawać synchronicznej kompresji podczas pagehide. Zachować istniejący
   kontrakt flush i jawnie testować zamknięcie karty; nie zwiększać keepalive
   ani kolejki. Worker tylko jeśli pomiary wykażą potrzebę i pokryją jego koszt.
   Nie używać stanu finalnie ustawianego dopiero po `await`, aby dwie równoległe
   ścieżki flush nie wysłały tego samego batcha podczas kompresji.
10. Metryki transportu bez treści; wszystkie nowe mechanizmy za osobnym
    przełącznikiem, niezależnym od coverage i privacy.

### Pliki

`server/src/analytics-script/tracking.ts`, `sessionReplay.ts`, `replayBatching.ts`;
`server/src/api/sessionReplay/recordSessionReplay.ts`;
`server/src/types/sessionReplay.ts`, `server/src/index.ts` (wyłącznie scoped route),
kontrakt tracking-config i testy integracyjne. Wspólny codec/helper w `shared`
tylko gdy realnie współdzielony; bez zależności browser → Node APIs.

### Testy i kryteria

- `gunzip(gzip(UTF8(JSON)))` daje dokładnie te same bajty UTF-8, w tym Unicode.
- Ten sam batch przez identity/gzip daje te same canonical eventy, kolejność,
  timestampy, sekwencje, user/session binding i metadane w ingest/readback.
- Maksymalne dozwolone payloady, granica +1, niewielki gzip rozwijający się ponad
  limit, pusty input, błędy CRC, wiele równoległych requestów i CORS przez proxy.
- Split/retry, utrata ACK, identity change, dwie karty, stary klient i backend.
- CPU, heap, long tasks i transfer na Chromium/Firefox/WebKit oraz fizycznym
  iPhonie; odtwarzanie nagrań zapisanych obiema ścieżkami.
- Zysk w rzeczywistych wysłanych bajtach z retry/preflight, nie tylko ZIP ratio.

Review bezpieczeństwa i wydajności. Brak nowej utraty lub nadmiarowych prób
w porównaniu z istniejącym transportem. Rollback: wyłączyć gzip writer,
pozostawić decoder dla otwartych kart i istniejących kolejek.

Commit: `feat(replay): redukcja etap 4 - bezstratny gzip uploadu`.

## 13. Etap 5 — drobne powtórzenia formatu

### Ponowna analiza

Najpierw mierzyć marginalny zysk ponad gzip z etapu 4. Mniejsze JSON przed gzip
nie wystarcza. Sprawdzić, jakie pola są faktycznie redundantne oraz czy ich brak
różni się od zera, pustego stringa, pustej mapy albo `null`.

### Implementacja

1. Wersjonowany codec wyłącznie na łączu, np. `wireVersion: 2`, negocjowany
   niezależnie od encodingu. Decoder Rybbit odtwarza dotychczasowy canonical
   event przed zapisem. Brak potrzeby przepisywania ClickHouse/R2 i historii.
2. Najpierw pomijanie stałych, pustych pól i wspólnych wersji w znanym formacie
   Network Replay; wartości domyślne odtwarzać dokładnie, zgodnie z wersją.
3. Następnie rozważyć słownik powtarzających się stringów tylko wewnątrz batcha
   i tylko w jawnie typowanych polach. Brak słownika współdzielonego między
   batchami, sesjami, kartami lub użytkownikami.
4. Nie zmieniać rrweb node ID, event order, timestamps, float timing ani stanów
   unknown/zero/null. Nie łączyć zdarzeń tylko dlatego, że wyglądają podobnie.
5. Nie zmieniać nieznanych pluginów. Dla nieobsługiwanych wariantów writer
   pozostawia dotychczasowy format; serwer nie interpretuje obcej wersji „na oko”.
6. Walidacja długości słownika, indeksów, typów, głębokości, collision/prototype
   pollution oraz maksymalnej rozwiniętej reprezentacji. Kompaktowy envelope
   nie obchodzi limitu canonical event/batch/ingress.
7. Format zwracany czytnikowi replay pozostaje kompatybilny. Obsługa compact
   w bazie nie jest warunkiem tego etapu i nie jest dodawana bez uzasadnienia.

### Benchmark i testy

Cztery pomiary na tym samym korpusie i urządzeniu: v1 plain, v1 gzip, v2 plain,
v2 gzip. Pełne bajty z envelope, CPU encode/decode, heap i integracja z ingest.
Property-based i golden test: `decode(encode(event))` zachowuje każde pole
canonical modelu, w tym nieobecne/null/zero oraz nieznane dane rrweb.

Warunek wdrożenia danej optymalizacji: powtarzalny dodatni wynik po gzip,
koszt CPU/heap mieszczący się w zamrożonym budżecie i zero różnic semantycznych.
Propozycje bez zysku są odrzucane z raportem pomiaru. Etap 5 nie jest pomijany:
ma implementację prototypu, testy i decyzję dla każdego kandydata; nie wymaga
wdrożenia wolniejszego kodeka tylko po to, by mieć zmianę w produkcji.

Review ze szczególnym naciskiem na aliasing, mutowanie wejścia, retry i zgodność
historycznych danych. Rollback: wyłączyć v2 writer, pozostawić v2 decoder.

Commit: `perf(replay): redukcja etap 5 - zmierzony kompaktowy format`.
Jeśli wszystkie prototypy są gorsze: commit testów i raportu zamiast włączania
kodeka, `test(replay): redukcja etap 5 - pomiary i odrzucenie regresji formatu`.

## 14. Etap 6 — pełne review i gotowość do produkcji

### Ponowna analiza i własne review

Przeczytać łączny diff wszystkich etapów oraz nowe interakcje między repo.
Potwierdzić każdy punkt R1–R5, wszystkie wyjątki, limity, source coverage i
odpowiedzialność za przechowanie. Review nie ogranicza się do przejścia testów.

Wykonać w szczególności:

- Prześledzić jeden POST z request body, duży GET response, request bez body,
  błąd auth, błąd sieci i request spoza naszego API przez cały pipeline.
- Sprawdzić, że nie podniesiono żadnego limitu ani nie dodano nieograniczonego
  bufora/spoolu, retry lub cache. Porównać efektywną konfigurację before/after.
- Wykazać, że każda nowo usunięta dozwolona informacja ma wskazane źródło,
  zgodną reprezentację i okres dostępności. Raport istniejących luk osobno.
- Fizyczny iPhone: replay stary/nowy, zmiany szybkości, seek, pause/resume,
  obrót, background/foreground, linki Grafany i nieudane odczyty body.
  Brak zamknięcia replay lub powrotu do listy wskutek nowej obsługi.
  WebKit automation nie zastępuje tego testu urządzenia.
- Test niezależnego rollbacku każdego writera, zgodności decoderów i odczytu
  już przyjętych nagrań. Wyłączenie archiwizacji nie kasuje zapisów.
- Audyt autoryzacji body viewer, redakcji sekretów, publicznych share linków,
  wygaśnięcia i błędów. Nowe testy nie zapisują produkcyjnych body do Git.

### Pełna walidacja

Komendy wykonujemy na właściwym checkoutcie z jego lockfile. Przed uruchomieniem
ponownie sprawdzamy aktualne scripts i wymagania środowiska. Żadnych migracji
ani komend deploy w trakcie walidacji lokalnej.

Rybbit (root workspace):

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build:server
pnpm build:client
pnpm --filter rybbit-backend check:analytics
pnpm --filter rybbit-backend format:check
pnpm --filter client format:check
```

Dodatkowo izolowane buildy backend/client z repo Dockerfile i lockfile,
bez przypadkowo dostępnego `server/src` w client build context. To osobna,
obowiązkowa bramka po wcześniejszym błędzie `observabilityContract.test.ts`.
Testy transportu uruchamiane przez taki sam reverse proxy jak produkcja.

WoT-CV FE (Yarn 4 z repo):

```text
yarn typecheck
yarn lint
yarn format:check
yarn test --run
yarn build
yarn e2e-run
```

WoT-CV BE: testy Spock zmienionych modułów `observability`/`api-shared` i ich
konsumentów, potem reactor `mvn verify` zgodnie z repo. Testy infrastrukturalne
na izolowanych usługach, z realnymi wersjami Collector/Loki, nigdy z mutującymi
fixture'ami na produkcji. Nie ukrywać pominiętych testów flagą skip jako PASS.

Jeżeli zastana baza ma niepowiązane błędy, rozdzielić baseline i regresję;
nie nazywać całej walidacji zieloną. Problemy istotne dla tej zmiany blokują
wydanie i dostają kolejny podetap: analiza → plan → poprawka → test → review → commit.

### Artefakty i bramka GO/NO-GO

- Release manifest SHA wszystkich zmienionych repo i wersji kontraktów.
- Rejestr niezmienionych limitów i retencji.
- Macierz coverage z dowodami, fixture corpus i raport hash/round-trip.
- Raport transfer/CPU/heap przed i po, osobno stary full i nowy metadata.
- Wyniki lokalne, Docker, staging, rzeczywisty iPhone; jawnie niewykonane próby.
- Runbook rollout/rollback z listą flag i odpowiedzialności za archiwum.
- Test backup/restore nowego jedynego źródła treści; brak niezaadresowanych
  krytycznych błędów, wycieków, utraty unikalnych danych lub regresji replay.

GO dopiero po tych dowodach. Sam plan, build lub endpoint health nie oznaczają
gotowości do produkcji. Jeżeli test fizycznego iPhone'a nie został wykonany,
raport nie może zawierać stwierdzenia, że ten scenariusz potwierdzono.

Commit: `test(observability): redukcja etap 6 - review i gotowosc wydania`.

## 15. Kolejność wdrożenia i odzyskanie stanu

1. Zatwierdzić artefakty, okno i zakres. Zebrać stan przed zmianą; nie wykonywać
   Better Auth cutover ani zmian baz niepowiązanych z tym projektem.
2. Wdrożyć addytywne readery/kontrakty/metryki z writerami wyłączonymi.
3. Włączyć i zweryfikować kompletność capture/archiwum/Grafany; nie usuwać kopii.
4. Włączyć coverage dla testowego zakresu, potem obserwować pełne macierze
   endpoint/status/type i awarie. Czas obserwacji sam nie zastępuje pokrycia.
5. Uruchomić nową politykę metadata/fallback po spełnieniu bramki etapu 3.
   Pozostawić kompatybilność otwartych starych kart.
6. Wdrożyć obsługę gzip po stronie serwera, ogłosić capability, następnie mały
   cohort writera i stopniowe rozszerzanie po pomiarach.
7. Analogicznie v2 codec tylko dla kandydatów wygrywających benchmark etapu 5.
8. Weryfikować każdą bramkę również po deploy: wersje, local/public health,
   parametry skryptu, właściwe dane w readback, Grafana, operator login i replay.

Przy pogorszeniu wyłączyć właściwy writer/policy. Nie cofać serwera do wersji,
która nie czyta formatów nadal wysyłanych przez otwarte karty. Nie usuwać body,
manifestów i readerów jako części rollbacku. Obserwować kolejki przed powrotem
do plain JSON, który może zwiększyć transfer względem właśnie wyłączonego gzip,
choć pozostaje w pierwotnych limitach.

Nie włączać wszystkiego jednym przełącznikiem. Wdrożenie nowych logów, zmiana
polityki wycofywania kopii i kompresja muszą mieć niezależne wyłączenie awaryjne.

## 16. Źródła techniczne i uzasadnienia

- Fastify sprawdza `bodyLimit` dla strumienia zwróconego z `preParsing`;
  wymagane jest prawidłowe rozliczenie `receivedEncodedLength`.
  [Hooks](https://fastify.dev/docs/v5.4.x/Reference/Hooks/),
  [bodyLimit](https://fastify.dev/docs/latest/Reference/Server/#bodylimit).
- Limity sumy structured metadata i liczby atrybutów mogą odrzucić wpis Loki;
  samo zmieszczenie pojedynczego body w limicie SDK nie wystarcza.
  [Loki OTLP ingestion](https://grafana.com/docs/loki/latest/send-data/otel/).
- Natywna kompresja jest negocjowana przez sprawdzenie możliwości runtime;
  round-trip i integralność gzip wymagają testów, niezależnie od biblioteki.
  [Compression Streams standard](https://compression.spec.whatwg.org/).

Wnioski o konkretnych lukach i plikach pochodzą z inspekcji repozytoriów.
Rekomendacje archiwum, receipt, polityki i rollout są projektem do implementacji,
nie twierdzeniem, że te mechanizmy już istnieją lub zostały przetestowane.

## 17. Review samego planu

Przeprowadzono przegląd projektu przed przekazaniem. Uwzględnione poprawki:

- Zastąpiono uproszczone „ID oznacza, że mamy body” dowodem konkretnego zapisu
  i osobnymi stanami przechwycenia, przechowania oraz widoczności w Loki.
- Zapisano granicę czasu response headers: nie można po fakcie dopisać receipt
  dla ukończonej odpowiedzi bez innego mechanizmu potwierdzenia.
- Rozdzielono fallback legacy full od aktualnego privacy cap metadata.
  Awaria archiwum nie uruchamia potajemnie body capture dla nowego FE.
- Dopisano limit canonical payload i budżetowanie ekspansji przed alokacją,
  aby gzip i słownik nie umożliwiły obejścia dotychczasowych ograniczeń.
- Uwzględniono wyścig asynchronicznego flush/kompresji oraz utratę
  `sequenceNumber` na istniejącej granicy walidacji.
- Wariant bez nowego magazynu ma pełne warunki kompletności i zasobów,
  a nie samą sugestię nieograniczonego dzielenia logu na części.
- Rollback wyłącza writery, ale zachowuje readery i zapisane body; nie niszczy
  danych używanych jako jedyne źródło historyczne.
- Końcowy PASS wymaga także izolowanego Docker build i realnego iPhone'a.

Pozostała decyzja organizacyjno-architektoniczna: zatwierdzenie miejsca i budżetu
przechowywania body. Nie wykonano zmian kodu aplikacji, migracji, commitów,
push ani wdrożenia w ramach przygotowania tego planu.
