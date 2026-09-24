# Redukcja Replay — wykonanie, 2026-09-24

## Obowiązujący zakres

Użytkownik zatwierdził implementację z commitami na koniec każdego etapu oraz
wyłączył prywatne archiwum body i multipart w Loki. Bez push i deploy.
Nie zwiększamy limitów. Nie usuwamy historii ani unikalnych danych przeglądarki.
Duże body w Grafanie pozostanie pominięte; jest to zaakceptowane ograniczenie,
nie rozwiązany problem trwałego przechowania. Dla danych bez dowodu zachowania
nie uruchamiamy dodatkowej redukcji full. Nowy FE pozostaje metadata privacy cap.

Kolejność: 0 → 1A → 1C (bez archiwum) → 2 → 3 → 4 → 5 → 6.
Każdy etap: analiza bieżącego kodu → plan → kod → test → review → poprawka → commit.
Nie traktować brakujących testów infrastruktury/urządzenia jako PASS.

## Etap 0 — analiza i plan przed implementacją

Stan wejścia: Rybbit d6b623ec, FE e5d822b9, BE 6fe486d7. W BE dwie zastane
pozycje AD ResourceTimingFilter pozostają poza zakresem i indeksami commitów.
SSH read-only 12:28:27 UTC: health ok na d6b623ec; FE metadata/e5d822b9;
tracking-config full. Body/event/batch: 1 000 000/2 500 000/7 000 000 B,
odczyt body 1000 ms. Loki: metadata 64KB/128 pól, line 256KB, rate/burst 32/64 MB;
główna retencja 30d (config zawiera też domyślne pola 0s, nie nadpisujemy jej).
Tempo: override 30d i pola bazowe 336h. Nginx tracking: 50M, body timeout 120s.
Nie zmieniono żadnej z tych wartości.

Plan:

1. Syntetyczny corpus bez danych produkcyjnych: metadata, legacy full, Unicode,
   snapshot, incremental, nieznany plugin, puste/zerowe wartości, kolejność.
2. Benchmark Node: rzeczywiste bajty UTF-8, gzip, round-trip i koszt CPU.
   Wyniki Node nie zastępują Safari/iPhone. Powtarzalny seed i świeże fixture'y.
3. CLI runtime audit wypisuje wyłącznie allowlistę flag/limitów/health SHA;
   nie wypisuje wejściowej konfiguracji ani sekretów przy błędzie walidacji.
4. Testy narzędzi Node bez instalowania nowych zależności.
5. Review: test mutacji fixture, Unicode, redakcja wyjścia, błędy HTTP, brak
   automatycznego network access w benchmarku, zero zmian limitów/produkcji.

Kryteria dalszych etapów: zero różnic canonical danych; niezmienione limity;
benchmark formatów na tym samym corpusie (minimum 30 prób po rozgrzewce).
Nowy codec aktywujemy tylko przy mniejszej liczbie wysłanych bajtów i bez
istotnej regresji CPU/heap; budżet porównania p95 CPU: nie więcej niż +10%
ponad v1 gzip dla optymalizacji formatu, z raportem szumu pomiarowego.
Kompresja ma być opcjonalna, małe/niedające oszczędności batche pozostają JSON.
Fizyczny iPhone oraz stagingowy pipeline to osobne bramki release, nie założenia.

### Wyniki i review

- `node --test scripts/tests/replay-data-baseline.test.mjs`: 4/4 PASS.
- `node scripts/replay-data-baseline.mjs --live`: PASS; obecne limity zgodne
  z baseline. Synthetic JSON/gzip: small 871/459 B; metadata 104223/4635 B;
  legacy 32183/1723 B; mixed 258393/13776 B. Nie są to oszczędności produkcyjne.
- Review: dodano bramkę wykrywającą wzrost limitów i ukrywanie treści błędu
  parsera JSON (odpowiedź serwera nie może wyciec do raportu diagnostycznego).
- `git diff --check`: PASS. Bez zmian runtime, zależności i danych produkcyjnych.

## Etap 1A — wynik w BE

BE `05278c30`: jawne stany/rozmiary, ograniczony capture, brak doczytywania
odrzuconych requestów, izolacja błędów loggera, redakcja sekretów strukturalnych.
Plan, review i komendy w BE `docs/REPLAY_DATA_REDUCTION.md`. Reactor
`mvn -pl observability,api-shared -am test -q` PASS. Bez deploy. Staged pliki
ResourceTimingFilter zachowane, potwierdzone niezmienionymi hashami indeksu.

## Etap 1C — analiza i plan przed implementacją

Nie ma archiwum, więc nie implementujemy readera, receipt ani linku do obiektu.
Istniejące linki Grafana pozostają wyszukiwaniem logów/trace, nie dowodem pokrycia.
Nowe stany z 1A nie są jeszcze na produkcji. Read-only audyt nie może zaliczać
starych wpisów jako nowego kontraktu.

1. Bounded CLI Loki query (ostatnia godzina, maks. 200 wpisów; bez paginacji
   ukrytej jako kompletne pokrycie). Maks. 8 MiB odpowiedzi narzędzia, 10 s timeout.
2. Raport tylko liczników: rozkład stanów, brakujące strony wymian, budżet
   UTF-8 metadata 64 KiB / 128 atrybutów i wartości SDK 16384 znaków.
3. Unknown/fake state i brak body przy inline = luka. Empty nie równa się brak
   loga. Nie wypisywać wartości ani correlation ID; próbka nie jest gwarancją.
4. Runbook Grafana, zapytania i macierz testów staging (bez mutacji prod),
   warunki NO-GO przy dropach/retencji/niepełnych danych. Test redakcji raportu.
5. Uruchomić CLI przez istniejące SSH wyłącznie read-only, review, commit.

### Wynik 1C / review

4/4 testy Node PASS. SSH: 200 wpisów, 100 sparowanych correlation ID, maks.
10570 B / 61 atrybutów; w próbce brak przekroczeń. 200 stanów unknown jest
oczekiwane — nowy BE nie został wdrożony. Próbka osiąga limit i NIE dowodzi
trwałości ani kompletności całego ruchu. Test end-to-end po wdrożeniu na staging
pozostaje bramką release. Review poprawiło odczyt API Loki: należy zażądać
`categorize-labels` i czytać `structuredMetadata`, nie traktować braku pola jako
zera wykorzystania budżetu. Brak metadata ma osobny licznik.

## Etap 2 — analiza i plan przed implementacją

Po wyłączeniu 1B żaden lokalny ID ani profil Grafany nie stanowi dowodu trwałości.
Nie powstanie martwy mechanizm przyjmujący `bodySaved` od przeglądarki. Resolver
w shared będzie rozdzielał request body/response body/nagłówki/query i obserwacje
przeglądarki. Dokładny origin, w tym scheme/port, oraz profil serwera ograniczają
tylko wyszukiwanie. Brak profilu, abort/opaque, brak ID i obcy origin nie mogą
wywołać usunięcia danych. Stan verified/expired jest zarezerwowany do przyszłego
zaufanego dowodu, którego aktualnie nie ma.

Plan: czysta funkcja v1 bez I/O i nowych pól w każdym evencie; runtime walidacja
wejścia; testy spoofingu origin/ID/stanu, błędów sieci i zachowania wszystkich
pól. Zastosowanie w UI w etapie 3. Kontrakt nie zmienia privacy cap ani transportu.

### Wynik 2 / review

15/15 Vitest PASS, shared build PASS. Resolver nie przyjmuje żadnego receipt i
zawsze zabrania dodatkowego usuwania captured fields. Historyczny obiekt wejścia
pozostaje nietknięty. Inny port/scheme/subdomena nie dziedziczą profilu. Same
statusy 200/401/403/500 i poprawne ID niczego nie potwierdzają. Bez nowych bajtów
w uploadach, bez zależności i importów server/src do klienta.

## Etap 3 — analiza i plan przed implementacją

FE już ustawia metadata. Serwer full pozostaje dozwolonym fallbackiem starszych
trackerów; bez 1B nie wolno globalnie go wyłączyć. Powtarzający się kod normalizacji
script tagu przenosimy do kontraktu shared, z testami wszystkich kombinacji.
Istniejący reader historycznych body pozostaje bez zmian. Nie dodajemy receipts,
request headers ani usuwania przy ingest, ponieważ nie ma zaufanego dowodu.

Plan: shared resolver privacy cap → użycie w recorder config → UI komunikat
unknown/unavailable (nigdy fałszywe verified) → stopPropagation dla linków →
testy React i parserów v1/full/metadata → extract/uzupełnienie lokalizacji → review.
Nie wymuszamy odświeżenia starych kart. Rollback nie zmienia capture obecnego FE.

### Wynik 3 / review

67/67 testów konfiguracji/privacy cap oraz 13/13 testów linków, historycznych
parserów i kontraktu PASS. Shared build PASS. Dwa komunikaty przetłumaczone we
wszystkich 12 językach; zachowane istniejące wartości i kolejność kluczy (extract
nie powoduje przypadkowego przeformatowania całych katalogów). Review uwzględniło
różnicę null/undefined dla brakującego atrybutu DOM: brak tagu zachowuje politykę
serwera, obecny błędny tag ogranicza do metadata. Klik/pointer nie zamyka przodka.
Nie zmieniono historycznych payloadów, limitów ani ustawień produkcyjnych FE.
