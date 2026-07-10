#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${ROOT_DIR}/.wotcv-deployment.env"
DEPLOY_BRANCH="${WOTCV_BRANCH:-feat/wotcv}"
DEPLOY_REMOTE="${WOTCV_REMOTE:-origin}"
HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
BACKEND_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-backend"
CLIENT_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-client"
COMPOSE_PROJECT_NAME="${WOTCV_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-rybbit}}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.wotcv.yml -f docker-compose.wotcv.branch-build.yml)

cd "${ROOT_DIR}"
export COMPOSE_PROJECT_NAME

command -v git >/dev/null 2>&1 || { echo "git is required." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before branch deployment." >&2
  exit 1
fi

read_state() {
  local key="$1"
  [[ -f "${STATE_FILE}" ]] || return 0
  sed -n "s/^${key}=//p" "${STATE_FILE}" | tail -n 1
}

wait_for_health() {
  local expected_git_sha="${1:-}"
  local expected_image_tag="${2:-}"
  local attempts=60
  local response
  local last_response=""

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if response="$(curl --fail --silent --show-error --max-time 5 "${HEALTHCHECK_URL}" 2>/dev/null)"; then
      last_response="${response}"
      if [[ -z "${expected_git_sha}" || "${response}" == *"\"gitSha\":\"${expected_git_sha}\""* ]]; then
        if [[ -z "${expected_image_tag}" || "${response}" == *"\"imageTag\":\"${expected_image_tag}\""* ]]; then
          printf '%s\n' "${response}"
          return 0
        fi
      fi
    fi
    sleep 2
  done

  if [[ -n "${last_response}" ]]; then
    printf '%s\n' "${last_response}"
  fi
  return 1
}

image_id() {
  local image="$1"
  local tag="$2"
  docker image inspect "${image}:${tag}" --format '{{.Id}}'
}

switch_to_branch() {
  git fetch "${DEPLOY_REMOTE}" --prune

  if git show-ref --verify --quiet "refs/heads/${DEPLOY_BRANCH}"; then
    git switch "${DEPLOY_BRANCH}"
  else
    git switch --track -c "${DEPLOY_BRANCH}" "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
  fi

  git merge --ff-only "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
}

rollback() {
  local previous_tag="$1"
  local previous_git_sha="$2"
  local previous_build_time="$3"
  local previous_backend_digest="$4"
  local previous_client_digest="$5"
  local rollback_deployed_at
  local rollback_response

  if [[ -z "${previous_tag}" || -z "${previous_git_sha}" ]]; then
    echo "No previous local build recorded; rollback must be performed manually." >&2
    return 1
  fi

  if ! docker image inspect "${BACKEND_IMAGE}:${previous_tag}" >/dev/null 2>&1; then
    echo "Previous backend image ${BACKEND_IMAGE}:${previous_tag} is not present locally." >&2
    return 1
  fi

  if ! docker image inspect "${CLIENT_IMAGE}:${previous_tag}" >/dev/null 2>&1; then
    echo "Previous client image ${CLIENT_IMAGE}:${previous_tag} is not present locally." >&2
    return 1
  fi

  echo "Rolling back to ${previous_tag}..." >&2
  rollback_deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  IMAGE_TAG="${previous_tag}" \
  WOTCV_GIT_SHA="${previous_git_sha}" \
  WOTCV_BUILD_TIME="${previous_build_time:-unknown}" \
  WOTCV_DEPLOYED_AT="${rollback_deployed_at}" \
  BACKEND_IMAGE_DIGEST="${previous_backend_digest:-unknown}" \
  CLIENT_IMAGE_DIGEST="${previous_client_digest:-unknown}" \
    "${COMPOSE[@]}" up -d --force-recreate backend client

  if ! rollback_response="$(wait_for_health "${previous_git_sha}" "${previous_tag}")"; then
    echo "Rollback health check failed; manual intervention is required." >&2
    return 1
  fi

  if [[ "${rollback_response}" != *"\"gitSha\":\"${previous_git_sha}\""* ]]; then
    echo "Rollback returned an unexpected git SHA: ${rollback_response}" >&2
    return 1
  fi

  echo "Rollback completed: ${previous_tag}" >&2
}

PREVIOUS_TAG="$(read_state LAST_IMAGE_TAG)"
PREVIOUS_GIT_SHA="$(read_state LAST_GIT_SHA)"
PREVIOUS_BUILD_TIME="$(read_state BUILD_TIME)"
PREVIOUS_BACKEND_DIGEST="$(read_state BACKEND_IMAGE_DIGEST)"
PREVIOUS_CLIENT_DIGEST="$(read_state CLIENT_IMAGE_DIGEST)"

echo "Fetching and fast-forwarding ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}..."
switch_to_branch

WOTCV_GIT_SHA="$(git rev-parse HEAD)"
IMAGE_TAG="sha-${WOTCV_GIT_SHA}"
WOTCV_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
WOTCV_DEPLOYED_AT="${WOTCV_BUILD_TIME}"

export IMAGE_TAG WOTCV_GIT_SHA WOTCV_BUILD_TIME WOTCV_DEPLOYED_AT
export BACKEND_IMAGE_DIGEST=unknown
export CLIENT_IMAGE_DIGEST=unknown

echo "Validating Compose configuration for ${DEPLOY_BRANCH} at ${WOTCV_GIT_SHA}..."
"${COMPOSE[@]}" config >/tmp/rybbit-wotcv-branch-build-compose.yml

BUILD_COMMAND=(build)
if [[ "${WOTCV_BUILD_PULL:-0}" == "1" ]]; then
  BUILD_COMMAND+=(--pull)
fi

echo "Building backend and client locally from ${DEPLOY_BRANCH}..."
"${COMPOSE[@]}" "${BUILD_COMMAND[@]}" backend client

BACKEND_IMAGE_DIGEST="$(image_id "${BACKEND_IMAGE}" "${IMAGE_TAG}")"
CLIENT_IMAGE_DIGEST="$(image_id "${CLIENT_IMAGE}" "${IMAGE_TAG}")"
export BACKEND_IMAGE_DIGEST CLIENT_IMAGE_DIGEST

echo "Starting backend and client..."
"${COMPOSE[@]}" up -d --force-recreate backend client

if ! HEALTH_RESPONSE="$(wait_for_health "${WOTCV_GIT_SHA}" "${IMAGE_TAG}")"; then
  echo "Health check failed. Recent logs:" >&2
  "${COMPOSE[@]}" logs --since=10m backend client >&2 || true
  rollback "${PREVIOUS_TAG}" "${PREVIOUS_GIT_SHA}" "${PREVIOUS_BUILD_TIME}" "${PREVIOUS_BACKEND_DIGEST}" "${PREVIOUS_CLIENT_DIGEST}" || true
  exit 1
fi

if [[ "${HEALTH_RESPONSE}" != *"\"gitSha\":\"${WOTCV_GIT_SHA}\""* ]]; then
  echo "Health endpoint returned an unexpected git SHA: ${HEALTH_RESPONSE}" >&2
  rollback "${PREVIOUS_TAG}" "${PREVIOUS_GIT_SHA}" "${PREVIOUS_BUILD_TIME}" "${PREVIOUS_BACKEND_DIGEST}" "${PREVIOUS_CLIENT_DIGEST}" || true
  exit 1
fi

if [[ "${HEALTH_RESPONSE}" != *"\"imageTag\":\"${IMAGE_TAG}\""* ]]; then
  echo "Health endpoint returned an unexpected image tag: ${HEALTH_RESPONSE}" >&2
  rollback "${PREVIOUS_TAG}" "${PREVIOUS_GIT_SHA}" "${PREVIOUS_BUILD_TIME}" "${PREVIOUS_BACKEND_DIGEST}" "${PREVIOUS_CLIENT_DIGEST}" || true
  exit 1
fi

cat >"${STATE_FILE}.tmp" <<EOF
LAST_BRANCH=${DEPLOY_BRANCH}
LAST_GIT_SHA=${WOTCV_GIT_SHA}
LAST_IMAGE_TAG=${IMAGE_TAG}
BACKEND_IMAGE_DIGEST=${BACKEND_IMAGE_DIGEST}
CLIENT_IMAGE_DIGEST=${CLIENT_IMAGE_DIGEST}
BUILD_TIME=${WOTCV_BUILD_TIME}
DEPLOYED_AT=${WOTCV_DEPLOYED_AT}
EOF
mv "${STATE_FILE}.tmp" "${STATE_FILE}"

echo "Branch build deployment completed."
echo "Branch: ${DEPLOY_BRANCH}"
echo "Git SHA: ${WOTCV_GIT_SHA}"
echo "Image tag: ${IMAGE_TAG}"
echo "Backend image ID: ${BACKEND_IMAGE_DIGEST}"
echo "Client image ID: ${CLIENT_IMAGE_DIGEST}"
echo "Health: ${HEALTH_RESPONSE}"
