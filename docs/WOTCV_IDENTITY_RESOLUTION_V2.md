# Identity Resolution v2

## Cel

Anonimowa aktywność zarejestrowana przed logowaniem lub rejestracją ma być widoczna jako historia tego samego użytkownika po wywołaniu `identify()`. Korelacja obejmuje tabelę użytkowników, sesje, globus, replay, retencję, Growth Accounting i filtry `user_id`.

## Model danych

- Tracker utrzymuje losowy identyfikator przeglądarki w `localStorage` i przesyła go jako `anonymous_id` razem ze zdarzeniami, identyfikacją i Session Replay.
- Backend zapisuje w ClickHouse zahashowany, zależny od strony identyfikator urządzenia. Nowy format zachowuje 128 bitów hasha.
- PostgreSQL `user_aliases` jest źródłem prawdy dla relacji `(site_id, anonymous_id) -> user_id`.
- ClickHouse odczytuje relacje przez słownik `user_identity_dict` z layoutem `complex_key_hashed`.
- Zapytania obliczają tożsamość bez modyfikowania historycznych faktów: jawne `identified_user_id` zapisane w chwili zdarzenia ma pierwszeństwo, następnie używany jest słownik, a na końcu anonimowe `user_id`.

Historyczne tabele ClickHouse nie są aktualizowane przez `ALTER TABLE UPDATE`. Dzięki temu identyfikacja nie uruchamia ciężkich mutacji i zaczyna działać po odświeżeniu słownika, domyślnie w ciągu 5-10 sekund.

## Granice tożsamości

- Pierwsze `identify()` przypisuje bieżący anonimowy identyfikator do konta.
- Ponowne `identify()` tego samego konta jest idempotentne.
- Tracker nie może przepisać aliasu należącego do innego konta. Backend zwraca `409 ANONYMOUS_ID_ALREADY_LINKED`, tracker obraca identyfikator i ponawia żądanie.
- `clearUserId()` oraz bezpośrednia zmiana konta obracają anonimowy identyfikator, aby aktywność po wylogowaniu nie była dopisywana do poprzedniego konta.
- Administrator może świadomie skorygować alias w panelu. Jest to jedyna ścieżka, która może zmienić właściciela istniejącego aliasu.
- Gdy strona ma `saltUserIds=true`, anonimowy identyfikator nadal obraca się codziennie. Korelacja anonimowej historii jest wtedy celowo ograniczona do dnia.

Podczas migracji backend zapisuje także bezpieczny alias zgodny z poprzednim, 12-znakowym hashem klienta. Nie odtwarza powiązań z fingerprintu IP+User-Agent i nigdy nie przejmuje istniejącego aliasu innego konta.

## Niezawodność transportu

- `identify()` ponawia błędy sieciowe, HTTP 429 i 5xx z wykładniczym opóźnieniem i jitterem.
- Session Replay zachowuje snapshot anonimowego i zidentyfikowanego ID w każdej paczce.
- Nieudana paczka replay jest ponawiana również wtedy, gdy przeglądarka nie generuje już nowych eventów.

## Migracja i wdrożenie

Migracja `0012_identity_resolution_v2.sql` dodaje do `user_aliases` pola `source` i `updated_at`, constraint źródła oraz usuwa redundantny indeks pokrywany przez unikalny constraint `(site_id, anonymous_id)`.

Skrypt `scripts/wotcv-branch-build-deploy.sh` wykonuje operacje w tej kolejności:

1. waliduje oczekiwany commit, working tree i efektywną konfigurację portów,
2. w razie potrzeby odtwarza wyłącznie Redis bez portu hosta i czeka na `healthy`,
3. waliduje pozostałą infrastrukturę oraz buduje i sprawdza obrazy backendu i klienta,
4. uruchamia migracje PostgreSQL z nowego obrazu,
5. odtwarza wyłącznie ClickHouse, aby załadować konfigurację słownika,
6. sprawdza słownik przed uruchomieniem nowego backendu,
7. odtwarza backend i klienta,
8. sprawdza health oraz uruchamia `wotcv-identity-v2-preflight.sh`,
9. w razie błędu aplikacji wraca do poprzednich lokalnych obrazów.

Preflight sprawdza brak portu hosta Redisa, połączenie backend -> Redis, schemat PostgreSQL, stan słownika, przykładowe rozwiązanie aliasu, stare mutacje oraz SHA/tag obrazu.

## Rollback

Zmiana schematu PostgreSQL jest addytywna i może pozostać po rollbacku. Stary backend ignoruje nowe kolumny i słownik. Awaryjne wyłączenie nowego rozwiązywania tożsamości bez cofania obrazu:

```dotenv
IDENTITY_RESOLUTION_V2=false
```

Po zmianie należy odtworzyć backend. Wyłączenie powoduje powrót zapytań do wartości `identified_user_id` zapisanej bezpośrednio w ClickHouse; nie usuwa aliasów ani danych.
