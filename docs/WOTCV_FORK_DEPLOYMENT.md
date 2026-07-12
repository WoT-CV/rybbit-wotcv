# Wdrożenie forka Rybbit WoT-CV

Opis funkcjonalnych i architektonicznych różnic forka znajduje się w [WOTCV_FORK_DIFFERENCES.md](WOTCV_FORK_DIFFERENCES.md). Ten plik zawiera wyłącznie procedury operacyjne.

Ten dokument opisuje przełączenie istniejącej instalacji Rybbit na fork WoT-CV bez zmiany nazw volume, domen ani reverse proxy.

## Założenia

- serwer buduje i uruchamia aplikację z gałęzi `feat/wotcv`,
- `master` pozostaje gałęzią synchronizowaną z oficjalnym Rybbit,
- Compose działa pod nazwą projektu `rybbit`, aby użyć obecnych volume `rybbit_*`,
- obecny port hosta Postgresa pozostaje `127.0.0.1:5433`,
- nie używamy `latest` jako identyfikatora wdrożenia,
- każde uruchomienie aplikacji ma widoczny commit SHA w `/api/health`,
- ręcznych migracji DB nie wykonujemy w ramach tych skryptów.

## Inwentaryzacja serwera

Na serwerze uruchom:

```bash
cd /ścieżka/do/rybbit
bash scripts/wotcv-server-audit.sh
```

Skrypt tworzy katalog i archiwum `wotcv-server-audit-*.tar.gz`. Jest read-only i redaguje typowe sekrety, tokeny, hasła i klucze.

Jeżeli potrzebne będą logi backend/client z ostatnich 30 minut:

```bash
WOTCV_AUDIT_INCLUDE_LOGS=1 bash scripts/wotcv-server-audit.sh
```

Najpierw wklej zawartość tych plików:

- `10-git-status.txt`
- `11-git-remotes.txt`
- `12-git-branch.txt`
- `13-git-head.txt`
- `34-compose-ps.txt`
- `35-compose-config.txt`
- `60-health.txt`

## Backup przed przełączeniem

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

Backup Postgres:

```bash
docker exec postgres pg_dumpall -U "${POSTGRES_USER:-frog}" > "$BACKUP_DIR/postgres-all.sql"
```

Snapshot ClickHouse i Redis wykonaj zgodnie z mechanizmem backupowym instalacji.

## Remote i gałęzie

Docelowy układ remote:

```text
origin   -> fork WoT-CV
upstream -> oficjalne repozytorium Rybbit
```

Jeżeli obecny `origin` wskazuje oficjalny Rybbit:

```bash
git branch "backup/pre-wotcv-fork-$(date +%F)"
git remote rename origin upstream
git remote add origin https://github.com/WoT-CV/rybbit-wotcv.git
git fetch origin --prune
git fetch upstream --prune
```

Jeżeli remote są już ustawione, wystarczy:

```bash
git remote -v
git fetch origin --prune
git fetch upstream --prune
```

## Konfiguracja lokalna nowego katalogu

Przed pierwszym buildem skopiuj konfigurację obecnej instalacji i dopisz wartości chroniące aktualne volume oraz porty:

```bash
cp /home/rybbit/.env /home/rybbit-wotcv/.env
cp /home/rybbit/Caddyfile /home/rybbit-wotcv/Caddyfile

cd /home/rybbit-wotcv

grep -q '^COMPOSE_PROJECT_NAME=' .env || echo 'COMPOSE_PROJECT_NAME=rybbit' >> .env
grep -q '^HOST_POSTGRES_PORT=' .env || echo 'HOST_POSTGRES_PORT=127.0.0.1:5433:5432' >> .env
```

Bez `COMPOSE_PROJECT_NAME=rybbit` Docker Compose uruchomiony z `/home/rybbit-wotcv` utworzy nowe volume zamiast użyć obecnych `rybbit_postgres-data`, `rybbit_clickhouse-data` i `rybbit_redis-data`.

## Build i wdrożenie z `feat/wotcv`

Używany zestaw Compose:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  config > /tmp/rybbit-wotcv-branch-build-compose.yml
```

Wdrożenie:

```bash
bash scripts/wotcv-branch-build-deploy.sh
```

Skrypt:

1. wymaga czystego working tree,
2. pobiera `origin/feat/wotcv`,
3. przełącza lokalną gałąź `feat/wotcv`,
4. wykonuje wyłącznie fast-forward,
5. buduje backend i client lokalnie na serwerze,
6. taguje obrazy jako `sha-<commit>`,
7. uruchamia `backend` i `client`,
8. czeka na `/api/health`,
9. sprawdza `gitSha` i `imageTag`,
10. zapisuje stan do `.wotcv-deployment.env`,
11. próbuje wrócić do poprzedniego lokalnego obrazu, jeżeli health check nie przejdzie.

Parametry:

```bash
WOTCV_BRANCH=feat/wotcv \
WOTCV_REMOTE=origin \
WOTCV_HEALTHCHECK_URL=http://127.0.0.1:3001/api/health \
bash scripts/wotcv-branch-build-deploy.sh
```

Jeżeli chcesz odświeżyć bazowe obrazy Dockera podczas builda:

```bash
WOTCV_BUILD_PULL=1 bash scripts/wotcv-branch-build-deploy.sh
```

## Wrapper w `/home/wotcv/tools`

Jeżeli aktualizacje mają być uruchamiane z katalogu narzędzi użytkownika `wotcv`, skopiuj wrapper:

```bash
mkdir -p /home/wotcv/tools
cp /home/rybbit-wotcv/scripts/update_rybbit_wotcv.sh /home/wotcv/tools/update_rybbit_wotcv.sh
chmod +x /home/wotcv/tools/update_rybbit_wotcv.sh
```

Uruchomienie:

```bash
/home/wotcv/tools/update_rybbit_wotcv.sh
```

Skrypt uruchamiaj jako użytkownik `wotcv`, bez `sudo`. Wrapper działa niezależnie od bieżącego katalogu. Domyślnie używa `/home/rybbit-wotcv`, gałęzi `origin/feat/wotcv`, projektu Compose `rybbit`, lokalnego healthchecka `http://127.0.0.1:3001/api/health` i publicznego healthchecka `https://tracking.wot-cv.com/api/health`.

Przed podmianą kontenerów skrypt sprawdza również, czy obraz backendu zawiera działający pakiet `@rybbit/shared`, a obraz klienta zawiera serwer Next.js standalone.

Przykłady nadpisania ustawień:

```bash
RYBBIT_REPO_DIR=/home/rybbit-wotcv \
WOTCV_BRANCH=feat/wotcv \
WOTCV_BUILD_PULL=1 \
/home/wotcv/tools/update_rybbit_wotcv.sh

WOTCV_SITE_ID=ID_STRONY \
/home/wotcv/tools/update_rybbit_wotcv.sh
```

## Alternatywny tryb obrazów GHCR

Tryb GHCR nadal istnieje dla wdrożeń po gotowych obrazach:

```bash
IMAGE_TAG=sha-PEŁNY_COMMIT ./scripts/wotcv-deploy.sh
```

Workflow `.github/workflows/build-wotcv-images.yml` buduje obrazy z `master` oraz `feat/wotcv`. Ten tryb wymaga dostępu do `ghcr.io/wot-cv`.

## Weryfikacja po wdrożeniu

```bash
curl -fsS http://127.0.0.1:3001/api/health | jq

curl -fsS https://tracking.wot-cv.com/api/script.js -o /tmp/rybbit-script.js
head -c 200 /tmp/rybbit-script.js
echo

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  ps

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  -f docker-compose.wotcv.branch-build.yml \
  logs --since=10m backend client

docker inspect backend --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
docker inspect client --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Health endpoint zwraca wersję forka, SHA, tag obrazu, identyfikator obrazu, czas budowania i czas wdrożenia.

Obrazy publikowane przez workflow zawierają etykiety OCI `revision`, `version`, `created`, `source`, `licenses` i `title`. Job walidacyjny przed budowaniem sprawdza również, czy `server/public/script.js` oraz `server/public/script-full.js` odpowiadają źródłom trackera.

## Weryfikacja funkcji analityki web

Po wdrożeniu można sprawdzić, czy odblokowane widoki `Strony`, `Wydajność` i `Boty` mają działające endpointy API:

```bash
cd /home/rybbit-wotcv

WOTCV_SITE_ID=ID_STRONY \
bash scripts/wotcv-smoke.sh analytics
```

Dla strony prywatnej przekaż klucz prywatnego linku albo API key:

```bash
WOTCV_SITE_ID=ID_STRONY \
WOTCV_PRIVATE_KEY=PRIVATE_LINK_KEY \
bash scripts/wotcv-smoke.sh analytics

WOTCV_SITE_ID=ID_STRONY \
WOTCV_API_KEY=API_KEY \
bash scripts/wotcv-smoke.sh analytics
```

Zakres czasu można zawęzić bez zmiany kodu:

```bash
WOTCV_SITE_ID=ID_STRONY \
WOTCV_START_DATE=2026-07-01 \
WOTCV_END_DATE=2026-07-10 \
WOTCV_TIME_ZONE=Europe/Warsaw \
bash scripts/wotcv-smoke.sh analytics
```

Tryb `growth` sprawdza wyłącznie analizę wzrostu, a `all` wykonuje oba zestawy kontroli.

`Wydajność` zaczyna pokazywać dane po włączeniu Web Vitals w ustawieniach strony i zebraniu zdarzeń `performance`. `Boty` pokazują dane, gdy tracker zapisuje zdarzenia botów dla danej strony.

## Weryfikacja źródła AGPL-3.0

Każdy build klienta otrzymuje `WOTCV_GIT_SHA` i generuje link do odpowiadającego mu commita w `WoT-CV/rybbit-wotcv`. Backend udostępnia ten sam link przez `/api/source`, nagłówek `X-Source-Code` oraz standardowy nagłówek `Link` z relacją `source`.

Po wdrożeniu sprawdź zgodność SHA i źródła:

```bash
curl -fsS https://tracking.wot-cv.com/api/health
curl -fsSI https://tracking.wot-cv.com/api/source | grep -i '^location:'
curl -fsS -D - -o /dev/null https://tracking.wot-cv.com/api/health \
  | grep -Ei '^(link|x-source-code):'
curl -fsS https://tracking.wot-cv.com/api/script.js | head -n 1
```

Ten sam kontrakt można sprawdzić skryptem operacyjnym:

```bash
WOTCV_API_BASE_URL=https://tracking.wot-cv.com/api \
bash scripts/wotcv-smoke.sh source
```

Wynik powinien wskazywać publiczny commit zgodny z `gitSha` zwróconym przez health endpoint. Interfejs aplikacji pokazuje ten sam link jako `Kod źródłowy (AGPL-3.0)` w stałym pasku bocznym, stopce oraz na ekranach logowania i rejestracji.

Repozytorium i wskazany commit muszą pozostać publicznie dostępne. Jeżeli repozytorium zostanie ustawione jako prywatne, trzeba udostępnić publiczne archiwum kompletnego odpowiadającego kodu źródłowego i skierować do niego wszystkie powyższe linki.

Nie publikuj `.env`, danych użytkowników, kluczy API ani innych sekretów. Nie są one częścią kodu źródłowego i nie są wymagane do spełnienia obowiązku udostępnienia Corresponding Source.

## Rollback

Automatyczny rollback jest wykonywany po nieudanym health checku, jeżeli `.wotcv-deployment.env` zawiera poprzedni tag i lokalne obrazy nadal istnieją.

Ręczny rollback do poprzedniego tagu obrazów GHCR:

```bash
IMAGE_TAG=sha-POPRZEDNI_COMMIT ./scripts/wotcv-deploy.sh
```

Po rollbacku ponownie sprawdź health, logi, dashboard i dostępność skryptu trackera pod `/api/script.js`.

## Synchronizacja `master` z upstream Rybbit

Do aktualizacji `master` użyj:

```bash
bash scripts/wotcv-sync-upstream-master.sh
```

Skrypt:

1. wymaga czystego working tree,
2. dodaje remote `upstream`, jeżeli go brakuje,
3. pobiera `origin` i `upstream`,
4. przełącza `master`,
5. fast-forwarduje `origin/master`,
6. tworzy backup branch,
7. robi merge `upstream/master` bez rebase,
8. nie pushuje automatycznie.

Push po udanej synchronizacji:

```bash
WOTCV_PUSH=1 bash scripts/wotcv-sync-upstream-master.sh
```

Synchronizacja `master`, a następnie automatyczne scalenie go do gałęzi wdrożeniowej bez pushowania:

```bash
WOTCV_MERGE_FEATURE=1 bash scripts/wotcv-sync-upstream-master.sh
```

Skrypt tworzy osobny backup przed merge do `master` oraz przed merge `master` do `feat/wotcv`. Przy konflikcie zatrzymuje się bez pushowania. Po rozwiązaniu konfliktów należy wykonać checklistę z `WOTCV_FORK_DIFFERENCES.md`; dopiero potem można wypchnąć obie gałęzie ręcznie albo ponowić procedurę z `WOTCV_PUSH=1`.

Jeżeli oficjalny Rybbit używa innej głównej gałęzi:

```bash
WOTCV_UPSTREAM_BRANCH=main bash scripts/wotcv-sync-upstream-master.sh
```
