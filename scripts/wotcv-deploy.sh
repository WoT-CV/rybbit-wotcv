#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/wotcv-common.sh"
STATE_FILE="${ROOT_DIR}/.wotcv-deployment.env"
HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
TARGET_TAG="${1:-${IMAGE_TAG:-}}"
BACKEND_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-backend"
CLIENT_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-client"
COMPOSE_PROJECT_NAME="${WOTCV_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-rybbit}}"
EXPECTED_COMPOSE_PROJECT_NAME="${WOTCV_EXPECTED_COMPOSE_PROJECT_NAME:-rybbit}"
CLICKHOUSE_VOLUME_NAME="${WOTCV_CLICKHOUSE_VOLUME_NAME:-rybbit_clickhouse-data}"
POSTGRES_VOLUME_NAME="${WOTCV_POSTGRES_VOLUME_NAME:-rybbit_postgres-data}"
REDIS_VOLUME_NAME="${WOTCV_REDIS_VOLUME_NAME:-rybbit_redis-data}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.wotcv.yml)
COMPOSE_CONFIG_FILE=""
CLICKHOUSE_EVENT_BASELINE=""
POSTGRES_DATA_BASELINE=""

cleanup() {
  [[ -z "${COMPOSE_CONFIG_FILE}" ]] || rm -f "${COMPOSE_CONFIG_FILE}"
}

trap cleanup EXIT

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

wotcv_require_expected_compose_project "${COMPOSE_PROJECT_NAME}" "${EXPECTED_COMPOSE_PROJECT_NAME}"
wotcv_require_commands git docker curl python3
wotcv_require_clean_worktree

image_digest() {
  local image="$1"
  docker image inspect "${image}:${TARGET_TAG}" --format '{{index .RepoDigests 0}}' | awk -F@ '{print $2}'
}

require_persistent_volumes() {
  wotcv_require_named_volume "${CLICKHOUSE_VOLUME_NAME}"
  wotcv_require_named_volume "${POSTGRES_VOLUME_NAME}"
  wotcv_require_named_volume "${REDIS_VOLUME_NAME}"
}

validate_persistent_storage() {
  wotcv_validate_container_persistence \
    "$("${COMPOSE[@]}" ps -q clickhouse)" \
    clickhouse \
    "${EXPECTED_COMPOSE_PROJECT_NAME}" \
    "${CLICKHOUSE_VOLUME_NAME}" \
    /var/lib/clickhouse
  wotcv_validate_container_persistence \
    "$("${COMPOSE[@]}" ps -q postgres)" \
    postgres \
    "${EXPECTED_COMPOSE_PROJECT_NAME}" \
    "${POSTGRES_VOLUME_NAME}" \
    /var/lib/postgresql/data
  wotcv_validate_container_persistence \
    "$("${COMPOSE[@]}" ps -q redis)" \
    redis \
    "${EXPECTED_COMPOSE_PROJECT_NAME}" \
    "${REDIS_VOLUME_NAME}" \
    /data
}

capture_clickhouse_event_baseline() {
  CLICKHOUSE_EVENT_BASELINE="$(wotcv_clickhouse_event_invariants "$("${COMPOSE[@]}" ps -q clickhouse)")"
  printf 'ClickHouse event baseline: %s\n' "${CLICKHOUSE_EVENT_BASELINE}"
}

capture_postgres_data_baseline() {
  POSTGRES_DATA_BASELINE="$(wotcv_postgres_data_invariants "$("${COMPOSE[@]}" ps -q postgres)")"
  printf 'PostgreSQL data baseline: %s\n' "${POSTGRES_DATA_BASELINE}"
}

validate_clickhouse_event_baseline() {
  local current_invariants

  current_invariants="$(wotcv_clickhouse_event_invariants "$("${COMPOSE[@]}" ps -q clickhouse)")"
  wotcv_assert_clickhouse_event_invariants_not_decreased \
    "${CLICKHOUSE_EVENT_BASELINE}" \
    "${current_invariants}"
}

validate_postgres_data_baseline() {
  local current_invariants

  current_invariants="$(wotcv_postgres_data_invariants "$("${COMPOSE[@]}" ps -q postgres)")"
  wotcv_assert_postgres_invariants_not_decreased \
    "${POSTGRES_DATA_BASELINE}" \
    "${current_invariants}"
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
    "${COMPOSE[@]}" up -d --no-deps --force-recreate backend client

  validate_persistent_storage
  validate_clickhouse_event_baseline
  validate_postgres_data_baseline

  if ! rollback_response="$(wotcv_wait_for_health "${HEALTHCHECK_URL}" "" "${previous_tag}")"; then
    echo "Rollback health check failed; manual intervention is required." >&2
    return 1
  fi

  if [[ "${rollback_response}" != *"\"imageTag\":\"${previous_tag}\""* ]]; then
    echo "Rollback returned an unexpected image tag: ${rollback_response}" >&2
    return 1
  fi

  echo "Rollback completed: ${previous_tag}" >&2
}

PREVIOUS_TAG="$(wotcv_read_state "${STATE_FILE}" LAST_IMAGE_TAG)"
PREVIOUS_BACKEND_DIGEST="$(wotcv_read_state "${STATE_FILE}" BACKEND_IMAGE_DIGEST)"
PREVIOUS_CLIENT_DIGEST="$(wotcv_read_state "${STATE_FILE}" CLIENT_IMAGE_DIGEST)"
WOTCV_DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

export IMAGE_TAG="${TARGET_TAG}"
export WOTCV_DEPLOYED_AT

echo "Validating Compose configuration for ${IMAGE_TAG}..."
COMPOSE_CONFIG_FILE="$(mktemp "${TMPDIR:-/tmp}/rybbit-wotcv-deploy-compose.${UID}.XXXXXX.json")"
"${COMPOSE[@]}" config --format json >"${COMPOSE_CONFIG_FILE}"
wotcv_validate_compose_persistence \
  "${COMPOSE_CONFIG_FILE}" \
  "${EXPECTED_COMPOSE_PROJECT_NAME}" \
  "${CLICKHOUSE_VOLUME_NAME}" \
  "${POSTGRES_VOLUME_NAME}" \
  "${REDIS_VOLUME_NAME}"
require_persistent_volumes
validate_persistent_storage
capture_clickhouse_event_baseline
capture_postgres_data_baseline

echo "Pulling immutable application images..."
"${COMPOSE[@]}" pull backend client

BACKEND_IMAGE_DIGEST="$(image_digest "${BACKEND_IMAGE}")"
CLIENT_IMAGE_DIGEST="$(image_digest "${CLIENT_IMAGE}")"
export BACKEND_IMAGE_DIGEST CLIENT_IMAGE_DIGEST

echo "Starting backend and client..."
"${COMPOSE[@]}" up -d --no-deps --force-recreate backend client
validate_persistent_storage
validate_clickhouse_event_baseline
validate_postgres_data_baseline

if ! HEALTH_RESPONSE="$(wotcv_wait_for_health "${HEALTHCHECK_URL}" "" "${IMAGE_TAG}")"; then
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
