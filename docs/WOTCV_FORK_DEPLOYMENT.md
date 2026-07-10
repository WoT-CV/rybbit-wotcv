# Wdrożenie forka Rybbit WoT-CV

Ten dokument opisuje przełączenie istniejącej instalacji Rybbit na obrazy forka WoT-CV bez zmiany projektu Docker Compose, nazw volume, domen ani reverse proxy.

## Wymagania

- czyste drzewo robocze Git,
- Docker z `docker compose`,
- `curl`,
- dostęp do pakietów `ghcr.io/wot-cv`,
- repozytoryjne `WOTCV_BASE_URL` ustawione dla workflow budującego klienta,
- tag obrazu w formacie `sha-<commit>`.

Nie używamy `latest`. Każde wdrożenie i rollback wskazuje niezmienny tag SHA.

## Inwentaryzacja serwera

W katalogu istniejącej instalacji wykonaj i zachowaj wynik:

```bash
pwd
git status --short
git remote -v
git branch --show-current
git rev-parse HEAD
docker compose ls
docker compose ps
docker compose config --services
docker compose config --volumes
docker volume ls
```

Zapisz używany katalog, nazwę projektu Compose, nazwy volume, aktywny profil Caddy, pliki override i konfigurację reverse proxy.

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

Snapshot ClickHouse i Redis wykonaj zgodnie z mechanizmem backupowym instalacji. Nie uruchamiaj ręcznie skryptów migracyjnych podczas przełączania obrazów.

## Przełączenie remote

```bash
git branch "backup/pre-wotcv-fork-$(date +%F)"
git remote rename origin upstream
git remote add origin https://github.com/WoT-CV/rybbit-wotcv.git
git fetch origin --prune
git fetch upstream --prune
git switch master
git branch --set-upstream-to=origin/master master
git merge --ff-only origin/master
git remote -v
```

Docelowo `origin` wskazuje fork WoT-CV, a `upstream` oficjalne repozytorium Rybbit.

## Logowanie do GHCR

Jeżeli pakiety nie są publiczne:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

Token potrzebuje wyłącznie uprawnienia do odczytu pakietów.

## Walidacja konfiguracji

```bash
export IMAGE_TAG=sha-PEŁNY_COMMIT

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  config > /tmp/rybbit-wotcv-compose.yml

grep -n "ghcr.io/wot-cv" /tmp/rybbit-wotcv-compose.yml
```

Sprawdź, że obrazy backend/client wskazują `ghcr.io/wot-cv`, a volume, porty, domeny i pozostałe usługi są niezmienione.

## Wdrożenie

```bash
IMAGE_TAG=sha-PEŁNY_COMMIT ./scripts/wotcv-deploy.sh
```

Skrypt:

1. wymaga czystego repozytorium i tagu `sha-*`,
2. waliduje wynik Compose,
3. pobiera wyłącznie backend i klienta,
4. zapisuje digesty obrazów,
5. odtwarza kontenery aplikacji,
6. czeka na `/api/health`,
7. sprawdza zwrócony tag,
8. zapisuje stan do ignorowanego `.wotcv-deployment.env`,
9. przy błędzie próbuje wrócić do poprzedniego tagu.

Adres health check można nadpisać:

```bash
WOTCV_HEALTHCHECK_URL=https://analytics.example.com/api/health \
IMAGE_TAG=sha-PEŁNY_COMMIT \
./scripts/wotcv-deploy.sh
```

## Weryfikacja

```bash
curl -fsS http://127.0.0.1:3001/api/health | jq

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  ps

docker compose \
  -f docker-compose.yml \
  -f docker-compose.wotcv.yml \
  logs --since=10m backend client

docker inspect backend --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
docker inspect client --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Health endpoint zwraca wersję forka, SHA, tag, digest, czas budowania i czas wdrożenia.

## Rollback

Automatyczny rollback jest wykonywany po nieudanym health checku, jeżeli `.wotcv-deployment.env` zawiera poprzedni tag. Ręczny rollback:

```bash
IMAGE_TAG=sha-POPRZEDNI_COMMIT ./scripts/wotcv-deploy.sh
```

Po rollbacku ponownie sprawdź health, logi oraz dostępność dashboardu i skryptu trackera.
