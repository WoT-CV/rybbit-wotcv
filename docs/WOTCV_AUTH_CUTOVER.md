# WoT-CV: kontrolowane przejście na Better Auth 1.7.3

Ten runbook dotyczy istniejącej instalacji `feat/wotcv`, aktualizowanej z Better Auth 1.6.25. Przygotowanie merge **nie uruchamia migracji ani wdrożenia**. Procedurę produkcyjną wykonuje operator dopiero po publikacji zatwierdzonego commita i przejściu CI. Zmiany protokołu opisuje również [dokument upstream](../server/docs/better-auth-1.7.3.md).

## Dlaczego potrzebne jest okno serwisowe

Migracja `0018_better_auth_173` kopiuje klientów OAuth, hashuje ich sekrety i inicjalizuje liczniki członkostwa zespołów. Stare procesy nie mogą jednocześnie rejestrować klientów ani zmieniać zespołów. Nowe SQL 0018–0020 są addytywne, ale nie oznacza to bezwarunkowej zgodności starej aplikacji z nowymi danymi.

Nie zmieniaj przy tej okazji `BASE_URL`, `BETTER_AUTH_SECRET`, nazw baz, projektu Compose ani wolumenów. Zachowaj `REPLAY_METADATA_MODE=v1`, dotychczasowe TTL i ustawienia Identity Resolution v2. Nie stosuj `down -v`, czyszczenia wolumenów, backfillu ani nowej bazy jako sposobu na przejście walidacji.

## Warunki przed pierwszym wdrożeniem

1. Zatwierdź dokładny SHA, testy i obrazy. Oddzielnie oceń zgłoszenia `npm audit`, zwłaszcza critical/high; udany build nie jest certyfikatem bezpieczeństwa.
2. Zapisz aktualne SHA/digest obrazów, efektywną konfigurację, stan słownika identity, mounty oraz liczniki kontrolne PostgreSQL/ClickHouse. Te liczniki nie zastępują backupu.
3. Przygotuj spójny backup PostgreSQL, zabezpiecz go przed nieuprawnionym dostępem i **sprawdź możliwość odtworzenia na osobnej, jednorazowej bazie**. Zachowaj również mechanizm odtworzenia ClickHouse/Redis. Nie testuj odtwarzania na produkcji.
4. Zaplanuj przerwę w przyjmowaniu ruchu, także trackingu. Zapewnij kontrolę reverse proxy i wyłącz równoległe deploye. Sprawdź wszystkie procesy zapisujące dane, inne repliki, zadania administracyjne i ręczne migratory. Skrypt zatrzymuje tylko usługę Compose `backend`; nie potrafi wykryć wszystkich zewnętrznych klientów bazy.
5. Wskaż rzeczywisty plik zweryfikowanego backupu: absolutna ścieżka, niepusty plik, mtime nie starsze niż 24 h. **Nie odświeżaj mtime starego backupu**, aby ominąć kontrolę. Skrypt sprawdza jedynie plik i jego wiek, nie zawartość ani poprawność odtworzenia.
6. Uruchamiaj aktualny launcher jako użytkownik wdrożeniowy, bez `sudo`. Zmienne potwierdzenia muszą być eksportowane do procesu; samo dopisanie ich do `.env` Compose nie jest potwierdzeniem operatora.

Po wykonaniu powyższych czynności operator ustawia w swojej powłoce:

```bash
export WOTCV_AUTH_CUTOVER_ACK=backup-verified-writers-reviewed
export WOTCV_AUTH_BACKUP_FILE=/absolutna/sciezka/do/zweryfikowanego-backupu
export WOTCV_EXPECTED_SHA='WSTAW_PELNY_OPUBLIKOWANY_SHA'
```

Wartości zastępcze należy podmienić. Dopiero potem operator uruchamia standardowy `update_rybbit_wotcv.sh`. Powyższe potwierdzenie oznacza zarówno zweryfikowany backup, jak i przegląd **wszystkich** starych writerów. Nie jest uniwersalną flagą „pomiń bezpieczeństwo”. Po zakończeniu usuń te zmienne z sesji powłoki.

## Co wykonują skrypty wdrożeniowe

1. Zachowują dotychczasowe kontrole projektu, external volumes, portów i liczników danych.
2. Budują obrazy lub pobierają zatwierdzone obrazy GHCR przed przerwą na migrację. Ścieżka GHCR wymaga zgodności rewizji obu obrazów z lokalnym HEAD, aby użyty SQL preflight odpowiadał wdrażanemu kodowi.
3. Sprawdzają dziennik Drizzle za pomocą połączenia `default_transaction_read_only=on`. Weryfikują hash SQL i timestamp migracji 0018. Nieznana/rozbieżna historia lub błąd zapytania przerywają operację.
4. Jeśli 0018 nie została wykonana, przeprowadzają read-only preflight duplikatów `(providerId, accountId)` i poprawności JSON legacy OAuth. Wymagają potwierdzenia oraz backupu, zatrzymują backend z timeoutem 60 s i sprawdzają zakończenie procesu. Aktywny kontener, wymuszone zabicie (137) lub niepoprawny odczyt stanu blokują migrację. Następnie ponawiają preflight po zatrzymaniu writerów.
5. Dopiero po tych kontrolach istniejący runner wdrożeniowy wykonuje migracje, kontroluje journal i liczniki, a następnie uruchamia nowe obrazy. Ścieżka branch-build zachowuje także odtworzenie kontenera ClickHouse na tym samym wolumenie oraz pełny preflight Identity Resolution v2.
6. Przy kolejnych wdrożeniach z już zastosowaną 0018 i działającym backendem 1.7.3 jednorazowe potwierdzenie nie jest wymagane. Zatrzymany backend pozwala ponowić przerwane wdrożenie. Działające stare workery przy nowym journalu wymagają ręcznej analizy, nie automatycznego ponowienia.

Kontrola wersji celowo dopuszcza obecnie **1.7.3**, a nie dowolną przyszłą wersję Better Auth. Kolejna aktualizacja wymaga ponownego przeglądu tej granicy migracji. Skrypty obsługują istniejącą instalację z jednym kontenerem backendu; nowa instalacja lub wiele replik wymagają oddzielnej procedury.

## Kryteria odbioru po migracji

- `/api/health` lokalnie i publicznie podaje oczekiwany SHA/tag; działają klient, backend i usługi danych.
- Pozostały te same wolumeny, użytkownicy, witryny, eventy i chroniona kohorta Replay. Wygasanie rekordów poza kohortą zgodnie z TTL nie jest samo w sobie awarią. Nie resetuj baseline po nieudanej kontroli, aby ukryć spadek.
- Sprawdź stare sesje, logowanie hasłem, istniejący API key, uprawnienia do organizacji/site, role admin/owner oraz zaproszenie i zmianę członkostwa zespołu.
- Jeżeli skonfigurowane: sprawdź Google/GitHub, Turnstile, odzyskiwanie hasła i e-mail. Callbacki mają wskazywać istniejącą domenę publiczną.
- Sprawdź MCP: discovery → logowanie → jawna zgoda → wywołanie narzędzia; odmowa zgody nie przyznaje dostępu. Po wylogowaniu powiązanej sesji bearer ma być odrzucony.
- Istniejące integracje OAuth muszą ponownie połączyć się i zaakceptować zgodę. Stare access/refresh tokens i consent nie są przyjmowane przez nowego providera. Password sessions/API keys nie są przepisywane przez migrację.
- Nie traktuj cofnięcia refresh tokenu jako natychmiastowego unieważnienia już wydanego JWT access tokenu. Obowiązują zasady opisane w dokumencie upstream.
- Sprawdź nasze funkcje: identyfikacja gracza i anonimowa historia, zapis/odtwarzanie Replay i Network Replay, eksport, Growth Accounting, mapy, GSC i panel organizacji.

## Postępowanie po błędzie

Przed zatrzymaniem backendu błąd preflight/backup kończy wdrożenie bez uruchamiania migracji. Po rozpoczęciu cutoveru utrzymuj ograniczenia ruchu i sprawdź log, journal oraz rzeczywisty stan kontenerów. Komunikat błędu nie oznacza, że wszystkie procesy są zatrzymane lub że żaden SQL nie został zastosowany.

Preferowane jest naprawienie nowej wersji i ponowienie tej samej ścieżki wdrożeniowej po analizie. Skrypty **blokują automatyczny rollback do 1.6**, jeżeli journal potwierdza migrację 0018. Rollback obrazów nie cofa danych ani schematu.

Ręczny powrót przez tę granicę wymaga osobnej decyzji operatora, zatrzymania nowych writerów i przeglądu grantów/tokenów OAuth: legacy tokens mogą odzyskać ważność, nawet jeśli dostęp cofnięto po cutoverze. Nowi klienci/zgody nie kopiują się z powrotem. Przed kolejnym przejściem na 1.7 konieczne jest uzgodnienie klientów i liczników zespołów po zapisach wersji 1.6. Nie obchodź kontroli samą zmianą wpisów journalu lub wersji w obrazie.

Nie przywracaj całej bazy „w ciemno” przy działającym ruchu: to może usunąć nowsze zapisy. Plan odtworzenia musi uwzględniać RPO, okres zatrzymania writerów i zgodność PostgreSQL z danymi pozostałych usług.

## Anonymous onboarding

Upstream dodaje `/try`, witryny bez właściciela oraz automatyczne usuwanie wygasłych witryn. W self-hosted WoT-CV całość pozostaje domyślnie wyłączona: `ENABLE_UNCLAIMED_SITES=false`.

Włączenie wymaga jawnego `ENABLE_UNCLAIMED_SITES=true` i `DISABLE_SIGNUP` innego niż `true`. Flaga zabezpiecza API tworzenia, warstwę lifecycle, stronę `/try`, banner i start/wykonanie cleanupu. Przy wyłączeniu już istniejące owner-less witryny nie są automatycznie usuwane; wymagają świadomej obsługi retencji. Authenticated claim API zachowuje kontrolowany mechanizm odzyskania istniejącej witryny przez uprawnionego użytkownika, niezależnie od możliwości tworzenia nowych witryn.

Nie uruchamiaj `setup.sh`, generycznego upstream `update.sh` ani ręcznych `docker compose up` jako zamiennika skryptu cutoveru na tej instalacji: nie zapewniają opisanych zabezpieczeń forka.
