#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="${ROOT_DIR}/.wotcv-deployment.env"
HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
TARGET_TAG="${1:-${IMAGE_TAG:-}}"
BACKEND_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-backend"
CLIENT_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-client"
COMPOSE_PROJECT_NAME="${WOTCV_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-rybbit}}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.wotcv.yml)

cd "${ROOT_DIR}"
export COMPOSE_PROJECT_NAME

if [[ -z "${TARGET_TAG}" ]]; then
  echo "Usage: IMAGE_TAG=sha-<commit> ./scripts/wotcv-deploy.sh" >&2
  exit 1
fi

if [[ ! "${TARGET_TAG}" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "IMAGE_TAG must be an immutable sha-* tag." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before deployment." >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "docker is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }

read_state() {
  local key="$1"
  [[ -f "${STATE_FILE}" ]] || return 0
  sed -n "s/^${key}=//p" "${STATE_FILE}" | tail -n 1
}

image_digest() {
  local image="$1"
  docker image inspect "${image}:${TARGET_TAG}" --format '{{index .RepoDigests 0}}' | awk -F@ '{print $2}'
}

wait_for_health() {
  local attempts=60
  local response

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if response="$(curl --fail --silent --show-error --max-time 5 "${HEALTHCHECK_URL}" 2>/dev/null)"; then
      printf '%s\n' "${response}"
      return 0
    fi
    sleep 2
  done

  return 1
}

rollback() {
  local previous_tag="$1"
  local previous_backend_digest="$2"
  local previous_client_digest="$3"
  local rollback_deployed_at
  local rollback_response

  if [[ -z "${previous_tag}" ]]; then
    echo "No previous deployment tag recorded; rollback must be performed manually." >&2
    return 1
  fi

  echo "Rolling back to ${previous_tag}..." >&2
  rollback_deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  IMAGE_TAG="${previous_tag}" \
  BACKEND_IMAGE_DIGEST="${previous_backend_digest:-unknown}" \
  CLIENT_IMAGE_DIGEST="${previous_client_digest:-unknown}" \
  WOTCV_DEPLOYED_AT="${rollback_deployed_at}" \
    "${COMPOSE[@]}" pull backend client
  IMAGE_TAG="${previous_tag}" \
  BACKEND_IMAGE_DIGEST="${previous_backend_digest:-unknown}" \
  CLIENT_IMAGE_DIGEST="${previous_client_digest:-unknown}" \
  WOTCV_DEPLOYED_AT="${rollback_deployed_at}" \
    "${COMPOSE[@]}" up -d --force-recreate backend client

  if ! rollback_response="$(wait_for_health)"; then
    echo "Rollback health check failed; manual intervention is required." >&2
    return 1
  fi

  if [[ "${rollback_response}" != *"\"imageTag\":\"${previous_tag}\""* ]]; then
    echo "Rollback returned an unexpected image tag: ${rollback_response}" >&2
    return 1
  fi

  echo "Rollback completed: ${previous_tag}" >&2
}

PREVIOUS_TAG="$(read_state LAST_IMAGE_TAG)"
PREVIOUS_BACKEND_DIGEST="$(read_state BACKEND_IMAGE_DIGEST)"
PREVIOUS_CLIENT_DIGEST="$(read_state CLIENT_IMAGE_DIGEST)"
WOTCV_DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

export IMAGE_TAG="${TARGET_TAG}"
export WOTCV_DEPLOYED_AT

echo "Validating Compose configuration for ${IMAGE_TAG}..."
"${COMPOSE[@]}" config >/tmp/rybbit-wotcv-compose.yml

echo "Pulling immutable application images..."
"${COMPOSE[@]}" pull backend client

BACKEND_IMAGE_DIGEST="$(image_digest "${BACKEND_IMAGE}")"
CLIENT_IMAGE_DIGEST="$(image_digest "${CLIENT_IMAGE}")"
export BACKEND_IMAGE_DIGEST CLIENT_IMAGE_DIGEST

echo "Starting backend and client..."
"${COMPOSE[@]}" up -d --force-recreate backend client

if ! HEALTH_RESPONSE="$(wait_for_health)"; then
  echo "Health check failed. Recent logs:" >&2
  "${COMPOSE[@]}" logs --since=10m backend client >&2 || true
  rollback "${PREVIOUS_TAG}" "${PREVIOUS_BACKEND_DIGEST}" "${PREVIOUS_CLIENT_DIGEST}" || true
  exit 1
fi

if [[ "${HEALTH_RESPONSE}" != *"\"imageTag\":\"${IMAGE_TAG}\""* ]]; then
  echo "Health endpoint returned an unexpected image tag: ${HEALTH_RESPONSE}" >&2
  rollback "${PREVIOUS_TAG}" "${PREVIOUS_BACKEND_DIGEST}" "${PREVIOUS_CLIENT_DIGEST}" || true
  exit 1
fi

cat >"${STATE_FILE}.tmp" <<EOF
LAST_IMAGE_TAG=${IMAGE_TAG}
BACKEND_IMAGE_DIGEST=${BACKEND_IMAGE_DIGEST}
CLIENT_IMAGE_DIGEST=${CLIENT_IMAGE_DIGEST}
DEPLOYED_AT=${WOTCV_DEPLOYED_AT}
EOF
mv "${STATE_FILE}.tmp" "${STATE_FILE}"

echo "Deployment completed."
echo "Tag: ${IMAGE_TAG}"
echo "Backend digest: ${BACKEND_IMAGE_DIGEST}"
echo "Client digest: ${CLIENT_IMAGE_DIGEST}"
echo "Health: ${HEALTH_RESPONSE}"
