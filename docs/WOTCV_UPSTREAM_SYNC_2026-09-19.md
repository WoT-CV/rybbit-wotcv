# Synchronizacja master → feat/wotcv — 2026-09-19

## Zakres

Integracja lokalna, bez commita, pushu i operacji na produkcji. Nie uruchamiano produkcyjnych migracji, kontenerów ani backfillu. Zatwierdzenie merge i późniejsze wdrożenie to osobne czynności operatora.

- Fork przed integracją: `a84d9c090d2f9de4fa97b5e08cc573db76dde7b9`.
- Zamrożony `origin/master`: `85a77b4576b49b6a7ebb487edd1a67f6ba7cf490`.
- Wspólna baza: `31009572aa0a481f41e208c61ec3126b35819fb4`.
- Historia od bazy: 128 commitów wyłącznie forka, 45 wyłącznie upstreamu.
- Upstream zmienił 402 ścieżki, 47 pokrywało się ze zmianami forka. Zwykły merge zgłosił 32 skonfliktowane pliki, w tym 22 katalogi tłumaczeń.
- Backup Git: `backup/feat-wotcv-a84d9c09-before-master-85a77b45`.
- Gałąź robocza: `integration/master-85a77b45-into-wotcv-20260919`.
- Izolowany worktree: `C:\PROJECTS\rybbit-wotcv-merge-85a77b45-20260919`.

Wykorzystano normalny merge `--no-ff --no-commit` dokładnego SHA, bez squash/rebase i bez wyboru całej strony konfliktu. Remote został ponownie sprawdzony po testach i nadal wskazywał powyższe SHA. Lokalny `master` nie był źródłem integracji.

## Rozstrzygnięcia integracyjne

| Obszar | Wynik |
| --- | --- |
| Better Auth/MCP | Przyjęto spójny zestaw 1.7.3, nowy provider OAuth/JWT, ekran jawnej zgody, zmiany zaproszeń i zespołów. Zachowano uprawnienia site/organizacji i konfigurację opcjonalnych integracji forka. |
| PostgreSQL | Przyjęto SQL 0018–0020 bez zmian względem upstreamu. SQL i snapshoty 0000–0017 pozostały niezmienione. Nowe snapshoty kontynuują forkową linię, zachowując siedem tabel Uptime, Network Replay oraz pola i indeksy identity. |
| Wdrożenie | Dodano read-only auth preflight, wymóg potwierdzonego backupu/all-writers review, zatrzymanie starego backendu przed pierwszą migracją i blokadę automatycznego rollbacku do 1.6. Obie ścieżki deployu używają wspólnego helpera; GHCR weryfikuje SHA klienta/backendu/lokalnych migracji. |
| Identity i filtry | Połączono nowe reguły atrybucji UTM i filtry sesji z asynchronicznym, site-scoped Identity Resolution v2. Dodano regresję łączącą user ID, UTM i ścieżkę. Nie wprowadzono historycznych mutacji identity. |
| Replay | Zachowano V1/V2, Network Replay, privacy/config, eksport BullMQ i player. Cleanup upstreamu uwzględnia obie tabele metadata. Nie zmieniono domyślnego trybu V1 ani TTL. |
| Anonymous onboarding | API, lifecycle, `/try`, banner i cleanup otrzymały capability `unclaimedSites`. Self-hosted domyślnie wyłączony; opt-in wymaga `ENABLE_UNCLAIMED_SITES=true` i niezablokowanego signup. Wyłączenie nie usuwa istniejących witryn bez właściciela. |
| UI self-hosted | Nowy układ Traffic/Behavior/Conversion/Health/Explore zachowuje Pages, Bots, Performance, Query i Dashboards. Pozostają Retention/Growth Accounting, Replay, prywatne linki i filtry w URL. Performance nie występuje podwójnie. |
| Claim/login | Nowy formularz claim korzysta z runtime Turnstile także na self-hosted. Wznowienie dialogu po OAuth nie otwiera go ponownie po ręcznym zamknięciu i odświeżeniu danych; checkout pozostaje zamontowany po cofnięciu private link. |
| Sesja klienta | Inicjalizacja browser store nie pobiera sesji podczas builda/SSR, nie mutuje wtedy współdzielonego stanu i kończy loading również po błędzie sieci. Ekran OAuth ma jawny tytuł strony. |
| Mapbox i lokalizacja | Zachowano domyślny publiczny token WoT-CV oraz pierwszeństwo konfiguracji runtime. JSON-y scalono trójstronnie po kluczach, zachowując forkowe tłumaczenia i dodając upstreamowe. PL: 2358 kluczy, bez pustych wartości i rozbieżności placeholderów. |
| Usługi i infrastruktura | Zachowano eksport Replay, warunkowe raporty tygodniowe, cloud-only marketing, source SHA/AGPL, shared, prekompresję, istniejące external volumes, loopback i wewnętrzny Redis. |
| Dokumentacja/CI | Przyjęto przewodniki/landing/docs upstreamu. Linter przewodników działa również na Windows (file URL, separatory ścieżek i CRLF). CI ogranicza workery testów, utrzymuje UTC i testuje nowy auth guard. |

### Linia snapshotów

Snapshot 0017 forka ma ID `951578fe-c04f-4fa0-8ce7-b1246fd746fc`. Nowa linia, zawierająca 46 tabel, to:

1. 0018: `3256e2bb-e663-4ed2-9e22-9a201c0915bb`, rodzic 0017 forka.
2. 0019: `9e89d115-c660-4614-9d01-6e9c7d9a288a`, rodzic nowego 0018.
3. 0020: `d4e9682a-c2ed-4e29-895a-d37ab11cba37`, rodzic nowego 0019.

Samo przyjęcie snapshotów upstreamu pomijałoby rozszerzenia bazy forka mimo braku konfliktu tekstowego. Test `migrationLineage` sprawdza linię, zachowanie poprzednich definicji oraz zgodność tabel/kolumn końcowego snapshotu z runtime schema. `invitation.createdAt` istniało już w forku; addytywna, idempotentna migracja 0019 nie wymaga przepisywania starszego SQL.

## Weryfikacja lokalna

Środowisko: Windows, Node 24.19.0, npm, czyste instalacje zależności w izolowanym worktree. Żaden test nie łączył się z produkcyjną bazą. Testy SQL używały jednorazowego, lokalnego PGlite.

| Kontrola | Wynik |
| --- | --- |
| Shared: instalacja i build | OK |
| Backend: pełna suite | 153 pliki, **2123 testy OK** |
| Backend: TypeScript/build, tracker, prekompresja | OK |
| `db:check` | OK, kontrola plików/metadata, nie migracja |
| `check:analytics` | OK, wygenerowany tracker spójny ze źródłami |
| OAuth poza domyślną strefą | Po 10 testów OK w America/Los_Angeles i Pacific/Auckland; pełna suite przeszła także w Europe/Warsaw. Poprawiono serializację dat adaptera testowego PGlite zgodnie z `pg`, bez zmiany timestampów produkcyjnych. |
| Frontend: pełna suite | 44 pliki, **561 testów OK** |
| Frontend: TypeScript + produkcyjny Turbopack build | OK, jawny lokalny `NEXT_PUBLIC_BACKEND_URL`, bez pobierania sesji przez SSR |
| Frontend: lint WoT-CV/Knip | OK; lint pozostawia 2 znane ostrzeżenia React Compiler przy TanStack Virtual, bez błędów |
| ESLint zmienionych powierzchni onboarding/OAuth/menu/store | OK |
| Format WoT-CV | OK po uwzględnieniu CRLF checkoutu (`--end-of-line auto`); repozytorium przechowuje LF. Nie reformowano niepowiązanych plików. |
| PL audit | 2358 kluczy, 0 braków/nadmiarów/pustych/niezgodnych placeholderów |
| Testy ochrony deploymentu | **47 testów OK**, fake Docker i pliki tymczasowe, bez prawdziwych migracji |
| Składnia zmienionych skryptów Bash | OK |
| YAML Compose/Actions | Parsowanie OK; nie zastępuje efektywnego `docker compose config` |
| Dokumentacja: production build | OK, 5329 stron statycznych |
| Przewodniki + agent docs | 93 przewodniki OK, 11 testów agent-readiness OK, test HTTP produkcyjnego docs OK |

Kontrola UI: Playwright + istniejący Edge headless, `http://127.0.0.1:3102`, 1440×1000 i 390×844. Browser plugin nie był dostępny. API było symulowane, bez produkcyjnych zapisów.

- `/try?domain=example.com` przy wyłączonej capability: komunikat PL, zero żądań utworzenia witryny.
- `/try` po opt-in: poprawna walidacja, normalizacja domeny, pojedynczy POST, obsłużony błąd 409 i ponownie aktywny przycisk. Oczekiwany wpis 409 w konsoli jest częścią testu błędu, nie ukrytą regresją.
- `/auth/consent`: klient i zakres uprawnień widoczne; brak automatycznej zgody; Cancel wysyła `accept=false` i przechodzi pod odpowiedź providera; niekompletny URL nie udostępnia przycisku autoryzacji.
- Sprawdzono URL/tytuł, treść, brak framework overlay, brak poziomego przepełnienia i screenshoty. Poza symulowanym 409 brak błędów aplikacji w sprawdzonych stanach.

## Jawne ograniczenia i ryzyka przed produkcją

1. **Docker nie jest zainstalowany lokalnie.** Nie wykonano lokalnego builda OCI, rzeczywistego `docker compose config`, rozruchu kontenerów ani smoke testu natywnych zależności Linux/arm64. Te kroki musi wykonać CI/staging po commicie. Parsowanie YAML i fake Docker nie potwierdzają zachowania prawdziwego runtime.
2. Nie wykonano odtworzenia backupu, migracji rzeczywistego PostgreSQL/ClickHouse ani testu z aktualną produkcyjną historią. Historyczne logi użytkownika z 8 września nie dowodzą dzisiejszego stanu serwera.
3. **`npm audit --omit=dev` nadal zgłasza podatności:** backend 47 (27 moderate, 18 high, 2 critical), klient 10 (2 moderate, 7 high, 1 critical). Critical wskazane przez audyt to `basic-ftp` i `fast-xml-parser` w backendowym drzewie zależności oraz `next` w kliencie. To liczby pakietów zgłaszanych przez npm, nie liczba niezależnych exploitów ani dowód osiągalności w produkcji. Wymagają osobnej analizy i kontrolowanych poprawek; nie wykonano `npm audit fix --force` ani masowych aktualizacji poza scaleniem.
4. Nie testowano prawdziwego Google/GitHub/Mapbox/Turnstile/MCP zewnętrznego klienta ani wysyłki e-mail. Ich konfigurację i uprawnienia trzeba sprawdzić po wdrożeniu w kontrolowanym środowisku.
5. **Pierwszy deploy wymaga [WOTCV_AUTH_CUTOVER.md](WOTCV_AUTH_CUTOVER.md).** Podanie `WOTCV_AUTH_CUTOVER_ACK` bez zweryfikowanego backupu i kontroli wszystkich writerów unieważnia założenia bezpieczeństwa. Po zastosowaniu 0018 automatyczny rollback do 1.6 jest celowo odrzucany.

## Przekazanie

Zweryfikowany wynik pozostawiono jako rozwiązaną, staged operację merge na `feat/wotcv`, z `MERGE_HEAD` wskazującym `85a77b45…`. Przeniesiony tree został porównany z tree izolowanej integracji; brak nierozwiązanych wpisów indeksu. Dopiero użytkownik tworzy merge commit i wykonuje push. Nie należy wykonywać kolejnego `pull` ani uruchamiać deploymentu z niezakończonym merge. Backup branch i izolowany worktree pozostają do kontroli/porównania.

Po przeniesieniu odświeżono zależności shared, backendu i dokumentacji w głównym checkoutcie; ponowiono tam również 2123 testy backendu, build, `db:check` i 47 testów skryptów. Instalacja klienta napotkała Windows `EPERM`/`EBUSY` na natywnym module Tailwinda, trzymanym przez istniejący lokalny proces Node (PID 19620). Nie zakończono cudzej sesji bez zgody. **Lokalne `client/node_modules` wymaga ponownego `npm ci --legacy-peer-deps` po zwolnieniu blokady**; próba naprawcza bez lockfile nie stanowi walidowanego środowiska i nie zmieniła committowanych manifestów/lockfile. Pełne wyniki testów/builda/UI klienta powyżej pochodzą z izolowanego worktree z czystą instalacją zgodną z lockfile. To lokalny problem środowiska, nie nierozwiązany konflikt Git ani awaria produkcji.
