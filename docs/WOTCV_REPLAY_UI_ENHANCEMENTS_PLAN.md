# WoT-CV Rybbit — plan usprawnień Replay UI

**Data:** 2026-07-10  
**Zakres:** host filter w Network Replay, marker aktualnego czasu w panelu Network, pomijanie bezczynności użytkownika  
**Tryb:** iteracyjna implementacja bez obowiązkowego dopisywania testów automatycznych

## 1. Cel

Po migracji forka Network Replay działa i pokazuje requesty w replay. Kolejne usprawnienia mają poprawić pracę diagnostyczną:

1. szybkie zawężenie requestów do wybranego hosta,
2. widoczny marker aktualnego czasu replay w panelu network, podobny do PostHoga,
3. automatyczne pomijanie fragmentów bez aktywności użytkownika.

Zmiany dotyczą głównie klienta Rybbit:

- `client/src/components/replay/network/*`
- `client/src/components/replay/player/*`
- `client/src/components/ui/activity-slider.tsx`
- `client/src/components/replay/replayStore.ts`

Backend i format eventów network nie wymagają zmian.

## 2. Feature 1 — filtr po hoście docelowym

### Obecny stan

Network panel posiada filtry po:

- metodzie HTTP,
- statusie,
- inicjatorze,
- minimalnym czasie trwania,
- przełączniku `Tylko Fetch/XHR`.

Brakuje filtrowania po hostach, np.:

- `api.wot-cv.com`,
- `machnium.wot-cv.com`,
- `tracking.wot-cv.com`.

### Zakres implementacji

1. Dodać helper parsujący host z `request.url`.
2. Rozszerzyć model filtrów w UI o `host`.
3. Wyliczać listę dostępnych hostów z pełnej listy requestów, a nie z listy już przefiltrowanej.
4. Dodać select `Wszystkie hosty` / konkretny host.
5. Pokazać licznik requestów dla aktywnego hosta albo w opcjach selecta, jeżeli komponent UI na to pozwoli bez komplikowania.
6. Filtr hosta ma działać razem z obecnymi filtrami metody, statusu, inicjatora i czasu.

### Pliki

- `client/src/components/replay/network/types.ts`
- `client/src/components/replay/network/networkEventUtils.ts`
- `client/src/components/replay/network/NetworkTimeline.tsx`

### Decyzje

- Host wyciągamy przez `new URL(request.url).hostname`.
- Dla błędnych lub względnych URL-i używamy wartości `unknown`.
- Na tym etapie nie robimy grupowania po domenie głównej; filtrujemy dokładny hostname.
- Hosty sortujemy alfabetycznie albo po liczbie requestów malejąco. Preferowane: liczba requestów malejąco.

### Kryteria akceptacji

- Da się wybrać `api.wot-cv.com` i widzieć tylko requesty do API WoT-CV.
- Da się wybrać `machnium.wot-cv.com` i widzieć tylko requesty do Machnium.
- Reset do `Wszystkie hosty` przywraca pełną listę.
- Pozostałe filtry nadal działają.

## 3. Feature 2 — marker aktualnego czasu w Network Replay

### Obecny stan

Replay ma `currentTime` w store i requesty mają `startOffset` oraz `endOffset`. Waterfall na dolnym sliderze pokazuje requesty aktywne względem czasu, ale prawy panel Network nie pokazuje wyraźnie, gdzie aktualnie znajduje się odtwarzanie względem listy requestów.

### Zakres implementacji

1. Dodać marker aktualnego czasu w `NetworkTimeline`.
2. Marker ma być żółtą linią lub belką z etykietą, np. `Aktualny czas 00:10`.
3. Pozycja markera jest liczona względem `request.startOffset`.
4. Jeżeli aktualny czas wypada między dwoma requestami, marker jest renderowany między nimi.
5. Jeżeli aktualny czas wypada w trakcie requestu, aktywny request pozostaje podświetlony, a marker wskazuje aktualną pozycję.
6. Dodać opcjonalny przełącznik `Śledź czas`, który podczas odtwarzania przewija listę do okolicy markera.

### Pliki

- `client/src/components/replay/network/NetworkTimeline.tsx`
- `client/src/components/replay/network/NetworkRequestRow.tsx`
- opcjonalnie `client/src/components/replay/network/networkEventUtils.ts`

### Decyzje

- Marker robimy w prawym panelu Network, bez przebudowy całego playera.
- Przy wirtualizacji listy marker musi być kompatybilny z obecnym mechanizmem renderowania rows.
- Auto-scroll nie może walczyć z ręcznym scrollowaniem użytkownika; dlatego domyślnie może być wyłączony albo czasowo pauzowany po manualnym scrollu.

### Kryteria akceptacji

- Podczas odtwarzania marker przesuwa się zgodnie z czasem replay.
- Kliknięcie requestu nadal wykonuje seek do początku requestu.
- Aktywny request nadal jest podświetlany między `startOffset` i `endOffset`.
- Przy dużej liczbie requestów UI pozostaje płynne.

## 4. Feature 3 — pomijanie bezczynności użytkownika

### Obecny stan

Kod już wylicza okresy aktywności:

- `client/src/components/replay/player/utils/replayUtils.ts`
- `client/src/components/replay/player/hooks/useActivityPeriods.ts`
- `client/src/components/replay/replayStore.ts`
- `client/src/components/ui/activity-slider.tsx`

Slider pokazuje aktywne okresy, ale player nie pomija automatycznie długich przerw.

### Zakres implementacji

1. Dodać do `replayStore` ustawienia:
   - `skipInactivityEnabled`,
   - `inactivitySkipThresholdMs`.
2. Dodać toggle w kontrolkach playera: `Pomijaj bezczynność`.
3. Dodać helper `findNextActivityPeriod(currentTime, activityPeriods)`.
4. Dodać hook `useSkipInactivity`, który podczas odtwarzania wykrywa przerwę i wykonuje `player.goto(nextActivity.start)`.
5. Nie pomijać bezczynności podczas ręcznego scrubbingu.
6. Dodać krótką informację UI po skoku, np. `Pominięto bezczynność 42 s`, jeżeli da się to zrobić bez rozbudowy overlay.

### Pliki

- `client/src/components/replay/replayStore.ts`
- `client/src/components/replay/player/ReplayPlayer.tsx`
- `client/src/components/replay/player/ReplayPlayerControls.tsx`
- `client/src/components/replay/player/hooks/useSkipInactivity.ts`
- `client/src/components/replay/player/utils/replayUtils.ts`

### Decyzje

- Startowy próg: przerwy dłuższe niż `5 s`.
- Skok wykonujemy tylko przy aktywnym odtwarzaniu.
- Nie zmieniamy realnej osi czasu replay; jedynie automatycznie wykonujemy seek.
- Ustawienie nie musi być globalnie persystowane. Jeżeli będzie wygodne, można użyć `localStorage`.

### Kryteria akceptacji

- Po włączeniu toggle player przeskakuje długie okresy bez aktywności.
- Po wyłączeniu toggle replay odtwarza się normalnie.
- Skoki nie powodują zapętlenia `goto`.
- Slider i `currentTime` pozostają zsynchronizowane.

## 5. Kolejność realizacji

### Etap A — filtr hosta

Najmniejsze ryzyko i największa natychmiastowa użyteczność diagnostyczna.

1. Helper `getRequestHost`.
2. Stan filtra hosta.
3. Select hosta w `NetworkTimeline`.
4. Manualna walidacja na requestach `api.wot-cv.com` i `machnium.wot-cv.com`.

### Etap B — marker aktualnego czasu

Wykorzystuje istniejące `currentTime`, `startOffset`, `endOffset`.

1. Helper obliczający pozycję markera.
2. Render markera w Network panelu.
3. Opcjonalne `Śledź czas`.
4. Manualna walidacja podczas odtwarzania i seekowania.

### Etap C — pomijanie bezczynności

Największe ryzyko UX, bo ingeruje w odtwarzanie.

1. Store i toggle.
2. Helper następnej aktywności.
3. Hook wykonujący `goto`.
4. Zabezpieczenia przed zapętleniem.
5. Manualna walidacja na długich replayach.

## 6. Ryzyka

- Auto-scroll w panelu Network może przeszkadzać, jeżeli użytkownik ręcznie analizuje requesty.
- Pomijanie bezczynności może ukryć istotne requesty wykonywane w tle bez interakcji użytkownika.
- Host filter musi działać na pełnym URL, także dla requestów z query stringiem.
- Przy bardzo dużej liczbie requestów marker w wirtualizowanej liście musi być lekki obliczeniowo.

## 7. Definition of Done

- Można filtrować requesty po hoście.
- Panel Network pokazuje aktualną pozycję replay względem listy requestów.
- Player ma toggle pomijania bezczynności.
- Wszystkie trzy funkcje działają na świeżych replayach WoT-CV.
- Brak regresji podstawowych akcji: play, pause, seek, wybór requestu, filtry network.
