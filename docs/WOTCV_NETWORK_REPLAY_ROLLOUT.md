# Rollout Network Replay WoT-CV

Etap rolloutowy nie wprowadza osobnego wariantu konfiguracji ani automatycznej aktywacji. Network Replay pozostaje domyślnie wyłączony i jest sterowany osobno dla każdej strony.

## Aktywacja per site

1. W ustawieniach strony włącz Session Replay.
2. Włącz Network Replay dla tej samej strony.
3. Sprawdź publiczny endpoint `GET /site/tracking-config/:siteId`.
4. Potwierdź, że `sessionReplay` i `networkReplay.enabled` mają wartość `true`.
5. Otwórz nową sesję i porównaj żądania w replay z DevTools.

Wyłączenie Network Replay w ustawieniach strony jest kill switchem. Tracker pobiera konfigurację strony przy ładowaniu i nie uruchamia observerów, gdy funkcja jest wyłączona. Wyłączenie Session Replay automatycznie wyłącza również Network Replay.

## Zgodność przeglądarek

Recorder wykrywa dostępne API i degraduje zakres danych bez wpływu na aplikację śledzonej strony:

| Brakujące API lub ograniczenie        | Zachowanie                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `fetch`                               | Rejestrowane są nadal XHR i zasoby z Performance API.                                  |
| `XMLHttpRequest`                      | Rejestrowane są nadal `fetch` i zasoby z Performance API.                              |
| `PerformanceObserver`                 | Requesty `fetch` i XHR są emitowane bez rozszerzonych timingów zasobów.                |
| Buffered PerformanceObserver          | Rejestrowane są nowe zasoby; przeglądarka może pominąć zasoby sprzed startu recordera. |
| `TextEncoder`                         | Rozmiar UTF-8 jest liczony przez bezpieczny fallback.                                  |
| `Blob.text()`                         | Tekst bloba jest odczytywany przez `FileReader`.                                       |
| `TextDecoder`                         | Request pozostaje w replay, a niedostępne body otrzymuje jawny powód.                  |
| Zablokowana modyfikacja prototypu XHR | Przywracane są wszystkie częściowe patche, a pozostałe obserwery działają dalej.       |

Obsługa nie obejmuje Internet Explorera. Błąd lub brak pojedynczego API nie może przerwać oryginalnego `fetch`, XHR ani Session Replay.

## Smoke check

Dla każdej aktywowanej strony sprawdź co najmniej:

- GET i POST przez `fetch`,
- GET i POST przez XHR,
- odpowiedź JSON i tekstową,
- request anulowany i zakończony błędem,
- przekierowanie,
- request z body większym niż limit,
- request aktywny podczas opuszczenia strony,
- wyłączenie Network Replay bez wyłączania Session Replay.

Przeglądarki do ręcznego smoke checku: aktualne Chrome, Edge, Firefox i Safari. W przypadku WebView sprawdź użyty silnik oddzielnie.

## Storage

Network Replay nadal korzysta z obecnego storage i retencji Session Replay. Ten etap nie zmienia limitów, TTL ani sposobu przechowywania body. Ewentualne wydzielenie body do osobnego storage wymaga decyzji właściciela instalacji na podstawie jego pomiarów.

## Dane do decyzji właściciela

Przed zmianą limitów lub storage właściciel instalacji porównuje:

- rozmiar sesji przed i po aktywacji,
- czas ingestu i pobierania replay,
- czas parsowania po stronie klienta,
- wykorzystanie ClickHouse lub R2,
- udział eventów odrzuconych przez limity,
- zgodność listy requestów z DevTools.

Wyniki pomiarów nie są automatycznie zamieniane na konfigurację przez skrypt wdrożeniowy.
