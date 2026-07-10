#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_BRANCH="${WOTCV_BRANCH:-feat/wotcv}"
DEPLOY_REMOTE="${WOTCV_REMOTE:-origin}"
HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
COMPOSE_PROJECT_NAME="${WOTCV_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-rybbit}}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.wotcv.yml -f docker-compose.wotcv.branch-build.yml)

cd "${ROOT_DIR}"
export COMPOSE_PROJECT_NAME WOTCV_BRANCH="${DEPLOY_BRANCH}" WOTCV_REMOTE="${DEPLOY_REMOTE}" WOTCV_HEALTHCHECK_URL="${HEALTHCHECK_URL}"

echo "Updating WoT-CV Rybbit from ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}..."
echo "Compose project: ${COMPOSE_PROJECT_NAME}"
echo "Healthcheck: ${HEALTHCHECK_URL}"

bash "${ROOT_DIR}/scripts/wotcv-branch-build-deploy.sh"

echo
echo "Containers:"
"${COMPOSE[@]}" ps

echo
echo "Health:"
curl --fail --silent --show-error --max-time 10 "${HEALTHCHECK_URL}"
echo
