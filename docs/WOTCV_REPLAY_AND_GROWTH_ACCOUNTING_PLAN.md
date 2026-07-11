# WoT-CV Rybbit — plan domyślnego pomijania bezczynności i Growth Accounting

**Data:** 2026-07-11

**Branch:** `feat/wotcv`

**Zakres:** Replay Player oraz analityka wzrostu użytkowników

**Powiązany plan:** `docs/WOTCV_REPLAY_UI_ENHANCEMENTS_PLAN.md`

## 1. Cele

1. Pomijanie bezczynności jest włączone domyślnie przy każdym uruchomieniu aplikacji.
2. Bezczynność jest pomijana przez bezpośredni skok na osi nagrania, bez czasowego zwiększania prędkości odtwarzania.
3. Rybbit otrzymuje wykres Growth Accounting pokazujący tygodniowo lub dziennie użytkowników:
   - nowych,
   - powracających,
   - reaktywowanych,
   - uśpionych.

## 2. Stan obecny

### Replay

- `skipInactivityEnabled` ma obecnie wartość początkową `false`.
- Aktywność użytkownika jest wyznaczana na podstawie ruchu wskaźnika, kliknięć, dotyku, przeciągania i wpisywania.
- Okno aktywności obejmuje `500 ms` przed zdarzeniem i `1000 ms` po zdarzeniu.
- `useSkipInactivity` korzysta z `player.goto(...)`, więc technicznie wykonuje skok, a nie zmianę prędkości.
- Próg `INACTIVITY_SKIP_THRESHOLD_MS = 5000` pozostawia krótsze okresy bezczynności bez pominięcia.
- Ikona `FastForward` może sugerować przyspieszanie zamiast skoku.

### Growth Accounting

- Fork nie ma gotowego ekranu ani endpointu Growth Accounting.
- Jest klasyczna retencja kohortowa oraz przykład dashboardu „Nowi i powracający użytkownicy”.
- Obecny przykład rozróżnia tylko dwie grupy i wyznacza pierwszą aktywność w zakresie zapytania, więc nie wystarcza do poprawnego Growth Accounting.
- Dane w tabeli ClickHouse `events` pozwalają wyliczyć wszystkie cztery grupy bez zmiany skryptu śledzącego i bez migracji bazy.

## 3. Definicje analityczne

Dla okresu `P` i poprzedniego okresu `P-1`:

- **Nowi** — aktywni w `P`, a ich pierwsza aktywność w całej dostępnej historii przypada na `P`.
- **Powracający** — aktywni zarówno w `P-1`, jak i w `P`.
- **Reaktywowani** — aktywni w `P`, nieaktywni w `P-1`, ale mają aktywność wcześniejszą niż `P`.
- **Uśpieni** — aktywni w `P-1`, ale nieaktywni w `P`.

Id użytkownika jest liczony jako:

```sql
COALESCE(NULLIF(identified_user_id, ''), user_id)
```

Wartość `uśpieni` jest zwracana przez API jako liczba dodatnia. Frontend pokazuje ją poniżej osi `0`, podobnie jak PostHog.

## 4. Etap 1 — pomijanie bezczynności domyślnie aktywne

### Implementacja

1. Ustawić `skipInactivityEnabled: true` w `replayStore`.
2. Pozostawić przełącznik w kontrolkach, aby użytkownik mógł wyłączyć funkcję w bieżącej sesji aplikacji.
3. Nie zapisywać wyłączenia do `localStorage`; po pełnym odświeżeniu aplikacji funkcja ponownie startuje jako aktywna.
4. Przy zmianie odtwarzanej sesji zachować bieżący wybór użytkownika, ponieważ `resetPlayerState` nie powinien resetować tego ustawienia.
5. Sprawdzić dostępność przełącznika przez `aria-pressed` i jednoznaczny tooltip.

### Pliki

- `client/src/components/replay/replayStore.ts`
- `client/src/components/replay/player/ReplayPlayerControls.tsx`

### Kryteria akceptacji

- Pierwsze otwarcie Replay ma aktywne `Pomijaj bezczynność`.
- Użytkownik może wyłączyć funkcję bez wpływu na play, pause i ręczne przewijanie.
- Odświeżenie strony ponownie ustawia funkcję jako aktywną.

### Commit

`feat(replay): complete stage 1 default inactivity skipping`

## 5. Etap 2 — pełny skok przez okres bezczynności

### Implementacja

1. Zachować wyłącznie mechanizm `player.goto(nextActivity.start)`; pomijanie nie może wywoływać `player.setSpeed(...)`.
2. Traktować jako bezczynność cały fragment od `1000 ms` po ostatniej aktywności do `500 ms` przed następną aktywnością.
3. Zastąpić próg `5000 ms` minimalnym technicznym progiem zapobiegającym skokom o pojedyncze klatki, np. `250 ms`.
4. Po skoku ustawić `currentTime` dokładnie na początek kolejnego okresu aktywności i wznowić odtwarzanie z wcześniej wybraną prędkością.
5. Zachować blokadę po ręcznym seeku, aby automatyczny skok nie walczył ze sliderem użytkownika.
6. Zabezpieczyć skok przed powtórzeniem do tego samego celu i przed skokiem poza czas nagrania.
7. Zastąpić ikonę `FastForward` ikoną oznaczającą skok, np. `SkipForward`, aby UI nie sugerował przyspieszania.
8. Zachować komunikat `Pominięto bezczynność {duration}` z rzeczywistą długością pominiętego odcinka.

### Pliki

- `client/src/components/replay/player/utils/replayUtils.ts`
- `client/src/components/replay/player/hooks/useSkipInactivity.ts`
- `client/src/components/replay/player/ReplayPlayerControls.tsx`
- `client/src/components/replay/replayStore.ts`

### Walidacja

- Długi brak ruchu, kliknięć i wpisywania powoduje jeden bezpośredni skok.
- Odtwarzanie zatrzymuje skok `500 ms` przed pierwszą kolejną aktywnością.
- Nowy okres bezczynności rozpoczyna się `1000 ms` po ostatniej aktywności.
- Zmiana prędkości na `0.5x`, `2x` lub `4x` nie wpływa na sposób pomijania.
- Ręczne cofnięcie do bezczynnego fragmentu nie powoduje natychmiastowego odbicia przez czas blokady manualnego seeku.

### Commit

`feat(replay): complete stage 2 hard inactivity jumps`

## 6. Etap 3 — backend Growth Accounting

### Endpoint

Dodać:

```text
GET /sites/:siteId/growth-accounting?mode=week&range=90&timeZone=Europe/Warsaw
```

Parametry:

- `mode`: `day` albo `week`, domyślnie `week`,
- `range`: `7-365` dni, domyślnie `90`,
- `timeZone`: strefa używana do granic okresów.

### Model odpowiedzi

```ts
interface GrowthAccountingPoint {
  period: string;
  newUsers: number;
  returningUsers: number;
  resurrectingUsers: number;
  dormantUsers: number;
}

interface GrowthAccountingResponse {
  data: GrowthAccountingPoint[];
  mode: "day" | "week";
  range: number;
}
```

### Zapytanie ClickHouse

1. Zbudować zbiór unikalnych okresów aktywności per efektywny użytkownik.
2. Wyznaczyć pierwszą aktywność użytkownika z całej dostępnej historii witryny, a nie tylko z wybranego zakresu.
3. Dociągnąć co najmniej jeden okres poprzedzający pierwszy okres widoczny na wykresie, aby poprawnie policzyć użytkowników powracających i uśpionych na lewej krawędzi.
4. Dla każdego okresu policzyć cztery rozłączne grupy zgodnie z definicjami z sekcji 3.
5. Zwrócić brakujące okresy z wartościami `0`, aby wykres nie miał przerw.
6. Ograniczyć zakres do `365` dni i ustawić bezpieczny czas wykonania zapytania.
7. W pierwszej wersji korzystać z `events`; nie dodawać migracji ani nowej tabeli.
8. Zmierzyć czas zapytania na danych produkcyjnych. Osobny agregat ClickHouse rozważyć dopiero, jeśli zapytanie regularnie przekracza `2 s`.

### Pliki

- `server/src/api/analytics/getGrowthAccounting.ts`
- `server/src/api/analytics/index.ts`
- `server/src/index.ts`

### Kryteria akceptacji

- Każdy aktywny użytkownik w okresie należy dokładnie do jednej grupy: nowi, powracający albo reaktywowani.
- Uśpieni są liczeni niezależnie jako odpływ względem poprzedniego okresu.
- „Nowy” nie zmienia się na „reaktywowany” po zmianie zakresu dat.
- Endpoint działa dla trybu dziennego i tygodniowego.

### Commit

`feat(analytics): complete stage 3 growth accounting API`

## 7. Etap 4 — wykres Growth Accounting

### Umiejscowienie

Dodać kartę na stronie `Retencja`, nad obecnym wykresem kohortowym. Dzięki temu nie powstaje kolejna pozycja nawigacji dla funkcji należącej do analityki retencji i wzrostu.

### Implementacja

1. Dodać typy endpointu i funkcję `fetchGrowthAccounting`.
2. Dodać hook TanStack Query z kluczem zależnym od witryny, trybu, zakresu i strefy czasowej.
3. Dodać komponent `GrowthAccountingChart` jako skumulowany wykres słupkowy.
4. Serie dodatnie:
   - `Nowi`,
   - `Powracający`,
   - `Reaktywowani`.
5. Serię `Uśpieni` renderować jako wartość ujemną poniżej osi `0`, zachowując dodatnią wartość w tooltipie.
6. Dodać legendę, tooltip z liczebnością każdej grupy i opis znaczenia kategorii.
7. Współdzielić kontrolki `Dziennie/Tygodniowo` oraz zakres czasu z obecną retencją.
8. Obsłużyć loading, błąd i pusty wynik zgodnie z istniejącymi komponentami strony Retencja.
9. Wszystkie nowe teksty dodać przez `next-intl`; polska wersja ma być kompletna, pozostałe języki zachowane.
10. Na wąskich ekranach zachować przewijanie lub minimalną szerokość wykresu bez ściskania legendy.

### Pliki

- `client/src/api/analytics/endpoints/misc.ts`
- `client/src/api/analytics/endpoints/index.ts`
- `client/src/api/analytics/hooks/useGetGrowthAccounting.ts`
- `client/src/app/[site]/retention/GrowthAccountingChart.tsx`
- `client/src/app/[site]/retention/page.tsx`
- `client/messages/*.json`

### Kryteria akceptacji

- Wykres pokazuje cztery serie dla każdego okresu.
- Uśpieni znajdują się poniżej osi `0`.
- Tooltip pokazuje dodatnią liczbę uśpionych użytkowników.
- Zmiana zakresu lub trybu odświeża oba widoki retencji spójnie.
- Widok działa w dark mode i na szerokościach desktopowych oraz mobilnych.

### Commit

`feat(analytics): complete stage 4 growth accounting chart`

## 8. Etap 5 — walidacja i pomiary

### Replay

1. Sprawdzić nagranie z ciągłym ruchem myszy — brak automatycznych skoków.
2. Sprawdzić nagranie z kliknięciami i wpisywaniem bez ruchu myszy — aktywność nie jest pomijana.
3. Sprawdzić kilka długich przerw — każdy fragment jest pomijany jednym skokiem.
4. Sprawdzić play, pause, slider, zmianę prędkości i wybór requestu sieciowego.

### Growth Accounting

1. Porównać ręcznie mały zestaw użytkowników między dwoma kolejnymi tygodniami.
2. Zweryfikować równanie:

```text
aktywni(P) = nowi(P) + powracający(P) + reaktywowani(P)
```

3. Zweryfikować, że `uśpieni(P)` to użytkownicy aktywni w `P-1` i nieaktywni w `P`.
4. Zmierzyć czas odpowiedzi dla zakresów `30`, `90` i `365` dni.
5. Uruchomić:

```bash
cd client && npx tsc --noEmit
cd client && npm run lint
cd client && npm run build
cd server && npm run build
```

6. Nie poprawiać niezwiązanych ostrzeżeń ani istniejących testów.

### Commit

`chore(analytics): complete stage 5 replay and growth validation`

## 9. Ryzyka i zabezpieczenia

- **Koszt pełnej historii:** klasyfikacja nowych i reaktywowanych wymaga wiedzy o wcześniejszej aktywności. Pierwsza wersja ma limit zakresu i pomiar czasu wykonania.
- **Zmiana identyfikacji:** przejście z anonimowego `user_id` na `identified_user_id` może rozdzielić historię, jeżeli aliasowanie nie połączy obu identyfikatorów w danych historycznych. Wyniki należy porównać z ekranem Użytkownicy.
- **Pierwszy widoczny okres:** bez dodatkowego okresu poprzedzającego wykres klasyfikacja powracających i uśpionych byłaby błędna.
- **Małe przerwy Replay:** minimalny techniczny próg zapobiega serii mikroskoków, ale nie może ponownie pełnić roli pięciosekundowego progu biznesowego.
- **Ręczny seek:** czasowa blokada automatycznego skoku pozostaje konieczna, aby użytkownik mógł świadomie obejrzeć bezczynny fragment.

## 10. Definition of Done

- Pomijanie bezczynności jest domyślnie włączone.
- Bezczynność jest pomijana bez zmiany prędkości odtwarzania.
- Skok zachowuje okno `1000 ms` po aktywności i `500 ms` przed aktywnością.
- Strona Retencja pokazuje Growth Accounting dla trybu dziennego i tygodniowego.
- Kategorie są rozłączne i zgodne z definicjami analitycznymi.
- Polska wersja nowych elementów jest kompletna.
- Każdy etap ma osobny commit na `feat/wotcv`.
