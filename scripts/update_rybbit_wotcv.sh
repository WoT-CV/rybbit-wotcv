#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${RYBBIT_REPO_DIR:-/home/rybbit-wotcv}"
LOCK_FILE="${RYBBIT_UPDATE_LOCK:-/tmp/rybbit-wotcv-update.lock}"
LOG_DIR="${RYBBIT_UPDATE_LOG_DIR:-${SCRIPT_DIR}/logs}"
PUBLIC_HEALTH_URL="${RYBBIT_PUBLIC_HEALTH_URL:-https://tracking.wot-cv.com/api/health}"

export WOTCV_REMOTE="${WOTCV_REMOTE:-origin}"
export WOTCV_BRANCH="${WOTCV_BRANCH:-feat/wotcv}"
export WOTCV_COMPOSE_PROJECT_NAME="${WOTCV_COMPOSE_PROJECT_NAME:-rybbit}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${WOTCV_COMPOSE_PROJECT_NAME}}"
export WOTCV_HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"

command -v flock >/dev/null 2>&1 || {
  echo "flock is required." >&2
  exit 1
}
command -v git >/dev/null 2>&1 || {
  echo "git is required." >&2
  exit 1
}
command -v docker >/dev/null 2>&1 || {
  echo "docker is required." >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/update_rybbit_wotcv_$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "${LOG_FILE}") 2>&1

on_error() {
  local code=$?
  echo "Update failed with exit code ${code}."
  echo "Log: ${LOG_FILE}"
  exit "${code}"
}
trap on_error ERR

exec 9>"${LOCK_FILE}"
flock -n 9 || {
  echo "Aktualizacja już trwa: ${LOCK_FILE}" >&2
  exit 1
}

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "Repozytorium nie istnieje albo nie jest repozytorium git: ${REPO_DIR}" >&2
  exit 1
fi

if [[ ! -x "${REPO_DIR}/scripts/wotcv-branch-build-deploy.sh" ]]; then
  echo "Brakuje wykonywalnego skryptu: ${REPO_DIR}/scripts/wotcv-branch-build-deploy.sh" >&2
  exit 1
fi

cd "${REPO_DIR}"

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.wotcv.yml
  -f docker-compose.wotcv.branch-build.yml
)

echo "WoT-CV Rybbit update"
echo "Repo: ${REPO_DIR}"
echo "Branch: ${WOTCV_REMOTE}/${WOTCV_BRANCH}"
echo "Compose project: ${COMPOSE_PROJECT_NAME}"
echo "Healthcheck: ${WOTCV_HEALTHCHECK_URL}"
echo "Log: ${LOG_FILE}"
echo

echo "Current revision:"
git status --short --branch
git log -1 --oneline
echo

bash "${REPO_DIR}/scripts/wotcv-branch-build-deploy.sh"

echo
echo "Containers:"
"${COMPOSE[@]}" ps

echo
echo "Local health:"
curl --fail --silent --show-error --max-time 10 "${WOTCV_HEALTHCHECK_URL}"
echo

if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  echo
  echo "Public health:"
  curl --fail --silent --show-error --max-time 15 "${PUBLIC_HEALTH_URL}"
  echo
fi

if [[ -n "${WOTCV_SITE_ID:-}" && -x "${REPO_DIR}/scripts/wotcv-self-hosted-analytics-smoke.sh" ]]; then
  echo
  echo "Analytics smoke check for site ${WOTCV_SITE_ID}:"
  bash "${REPO_DIR}/scripts/wotcv-self-hosted-analytics-smoke.sh"
fi

echo
echo "Update completed successfully."
echo "Log: ${LOG_FILE}"
