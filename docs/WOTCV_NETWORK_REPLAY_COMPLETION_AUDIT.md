# WoT-CV Network Replay — audyt realizacji planu

**Data audytu:** 2026-07-10  
**Gałąź audytowana:** `feat/wotcv`  
**Commit bazowy audytu:** `ce885c5e`  
**Zakres:** porównanie implementacji z `docs/WOTCV_NETWORK_REPLAY_IMPLEMENTATION_PLAN.md`

## Wynik ogólny

POC funkcjonalny jest zaimplementowany w kodzie forka. Nie każdy punkt planu można uznać za produkcyjnie zamknięty, ponieważ część planu dotyczy testów automatycznych, browser matrix, pomiarów na realnej instalacji, rollbacku i obserwowalności licznikowej.

## Status etapów PR 0-10

| Etap | Status | Dowód w repo | Uwagi |
| --- | --- | --- | --- |
| PR 0 — dokumentacja | Zrealizowane | `docs/WOTCV_NETWORK_REPLAY_IMPLEMENTATION_PLAN.md` | Plan istnieje i został uzupełniony o język polski jako ostatni etap. |
| PR 1 — konfiguracja i modele | Zrealizowane | `shared/src/networkReplay.ts`, `server/src/db/postgres/schema.ts`, `server/drizzle/0010_uneven_juggernaut.sql`, `server/src/lib/networkReplayConfig.ts`, `server/src/api/sites/updateSiteConfig.ts`, `client/src/components/SiteSettings/TrackingTab.tsx` | JSONB migration istnieje, default jest wyłączony, konfiguracja jest normalizowana i walidowana. |
| PR 2 — core network recorder | Zrealizowane w POC | `server/src/analytics-script/networkReplay/fetchObserver.ts`, `server/src/analytics-script/networkReplay/xhrObserver.ts`, `server/src/analytics-script/networkReplay/bodyCapture.ts`, `server/src/analytics-script/networkReplay/headerCapture.ts`, `server/src/analytics-script/networkReplay/pendingRequests.ts` | Unit testy z planu nie są kompletne zgodnie z ustalonym trybem POC. |
| PR 3 — PerformanceObserver i deduplikacja | Zrealizowane w POC | `server/src/analytics-script/networkReplay/performanceObserver.ts`, `server/src/analytics-script/networkReplay/timing.ts` | Wymaga walidacji w przeglądarkach i porównania z DevTools. |
| PR 4 — rrweb i byte-aware batching | Zrealizowane w POC | `server/src/analytics-script/networkReplay/networkPlugin.ts`, `server/src/analytics-script/sessionReplay.ts` | Obsługa batch size i 413 istnieje, ale wymaga testu na realnym payloadzie. |
| PR 5 — parser i lista Network | Zrealizowane | `client/src/components/replay/network/parseNetworkEvents.ts`, `client/src/components/replay/network/NetworkTimeline.tsx`, `client/src/components/replay/network/NetworkRequestRow.tsx`, `client/src/components/replay/ReplayBreadcrumbs.tsx` | Replay bez networku powinien pozostać obsłużony przez pustą listę requestów. |
| PR 6 — inspector i waterfall | Zrealizowane | `client/src/components/replay/network/NetworkRequestDetails.tsx`, `client/src/components/replay/network/BodyViewer.tsx`, `client/src/components/replay/network/NetworkWaterfall.tsx`, `client/src/components/ui/activity-slider.tsx` | Aktywność requestów jest podpięta pod obecny czas playera. |
| PR 7 — deployment forka | Rozszerzone w tym etapie | `.github/workflows/build-wotcv-images.yml`, `docker-compose.wotcv.yml`, `docker-compose.wotcv.branch-build.yml`, `scripts/wotcv-deploy.sh`, `scripts/wotcv-branch-build-deploy.sh`, `docs/WOTCV_FORK_DEPLOYMENT.md` | Istnieje tryb obrazów GHCR oraz tryb budowania na serwerze z `feat/wotcv`. |
| PR 8 — rollout i poprawki | Częściowo zrealizowane | `docs/WOTCV_NETWORK_REPLAY_ROLLOUT.md`, browser compatibility fixes w kodzie recordera | Pełny browser matrix pozostaje ręczną walidacją na instalacji. |
| PR 9 — `wot-cv-fe` cleanup | Zrealizowane poza tym repo | `C:\PROJECTS\wot-cv-fe` branch `feat/rybbit-v2`, commit `b28e333` | Ten etap nie jest częścią drzewa `rybbit-wotcv`. |
| PR 10 — język polski | Zrealizowane jako dodanie obsługi | `client/messages/pl.json`, `client/src/i18n/routing.ts`, `client/src/i18n/language-utils.ts` | Obsługa PL została dodana bez usuwania pozostałych języków. |

## Punkty planu wymagające dalszej walidacji

| Obszar | Status | Co trzeba sprawdzić na serwerze |
| --- | --- | --- |
| Komplet testów z sekcji 14 | Niepełne świadomie dla POC | Testy jednostkowe fetch/XHR/parser/backend nie są pełnym warunkiem obecnego POC. |
| Kryteria 95% requestów i brak duplikatów | Wymaga pomiaru | Porównać próbkę requestów z DevTools na realnym ruchu. |
| Różnica timestampów do 100 ms | Wymaga pomiaru | Porównać `startedAt`, `durationMs` i Resource Timing w Chrome/Edge/Firefox/Safari. |
| HTTP 413 i duże payloady | Częściowo w kodzie | Wygenerować payload przekraczający limit i potwierdzić brak pętli retry. |
| Rollback obrazu lub builda | Skrypty istnieją | Wykonać kontrolowany rollback na serwerze po pierwszym wdrożeniu forka. |
| Obserwowalność licznikowa z sekcji 16 | Częściowa | Są ostrzeżenia techniczne, ale nie ma pełnego zestawu liczników capture. |
| Prywatność i dokumenty prawne | Poza kodem | Surowe headers/body wymagają osobnej decyzji właściciela instalacji przed włączeniem. |

## Wniosek

Implementacja spełnia zakres POC i może przejść do przygotowania migracji serwera. Elementy, których nie należy oznaczać jako zamknięte produkcyjnie bez danych z serwera, to test matrix, pomiary zgodności z DevTools, rollback, duże payloady oraz obserwowalność licznikowa.
