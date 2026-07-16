#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/wotcv-common.sh"
STATE_FILE="${ROOT_DIR}/.wotcv-deployment.env"
DEPLOY_BRANCH="${WOTCV_BRANCH:-feat/wotcv}"
DEPLOY_REMOTE="${WOTCV_REMOTE:-origin}"
EXPECTED_GIT_SHA="${WOTCV_EXPECTED_SHA:-}"
HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
BACKEND_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-backend"
CLIENT_IMAGE="ghcr.io/wot-cv/rybbit-wotcv-client"
COMPOSE_PROJECT_NAME="${WOTCV_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-rybbit}}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.wotcv.yml -f docker-compose.wotcv.branch-build.yml)
COMPOSE_CONFIG_FILE=""

cleanup() {
  [[ -z "${COMPOSE_CONFIG_FILE}" ]] || rm -f "${COMPOSE_CONFIG_FILE}"
}

trap cleanup EXIT

cd "${ROOT_DIR}"
export COMPOSE_PROJECT_NAME

wotcv_require_non_root
wotcv_require_commands git docker curl python3
wotcv_require_clean_worktree

image_id() {
  local image="$1"
  local tag="$2"
  docker image inspect "${image}:${tag}" --format '{{.Id}}'
}

validate_runtime_images() {
  docker run --rm --entrypoint node "${BACKEND_IMAGE}:${IMAGE_TAG}" \
    --input-type=module --eval 'await import("@rybbit/shared")'
  docker run --rm --entrypoint node "${CLIENT_IMAGE}:${IMAGE_TAG}" \
    --check /app/client/server.js
}

validate_compose_config() {
  python3 - "${COMPOSE_CONFIG_FILE}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    config = json.load(config_file)

services = config["services"]
redis_ports = services["redis"].get("ports") or []
if redis_ports:
    raise SystemExit(f"Redis must not publish host ports: {redis_ports}")

for service_name in ("clickhouse", "postgres", "backend", "client"):
    for port in services[service_name].get("ports") or []:
        host_ip = port.get("host_ip")
        if host_ip not in ("127.0.0.1", "::1"):
            raise SystemExit(f"{service_name} publishes a non-loopback port: {port}")

print("Compose port validation passed.")
PY
}

validate_infrastructure() {
  local service
  local container_id
  local state
  local health
  local port_bindings

  for service in postgres clickhouse redis; do
    container_id="$("${COMPOSE[@]}" ps -q "${service}")"
    if [[ -z "${container_id}" ]]; then
      echo "Required infrastructure service ${service} is not created." >&2
      return 1
    fi

    state="$(docker inspect "${container_id}" --format '{{.State.Status}}')"
    health="$(docker inspect "${container_id}" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
    if [[ "${state}" != "running" || ("${health}" != "healthy" && "${health}" != "none") ]]; then
      echo "Required infrastructure service ${service} is not ready (state=${state}, health=${health})." >&2
      return 1
    fi

    port_bindings="$(docker inspect "${container_id}" --format '{{json .HostConfig.PortBindings}}')"
    python3 - "${service}" "${port_bindings}" <<'PY'
import json
import sys

service_name = sys.argv[1]
bindings = json.loads(sys.argv[2]) or {}

if service_name == "redis" and bindings:
    raise SystemExit(f"Running Redis container publishes host ports: {bindings}")

for container_port, published_ports in bindings.items():
    for published_port in published_ports or []:
        if published_port.get("HostIp") not in ("127.0.0.1", "::1"):
            raise SystemExit(
                f"Running {service_name} container publishes {container_port} outside loopback: {published_port}"
            )
PY
  done
}

wait_for_service_health() {
  local service="$1"
  local container_id
  local state
  local health

  for _ in {1..60}; do
    container_id="$("${COMPOSE[@]}" ps -q "${service}")"
    if [[ -n "${container_id}" ]]; then
      state="$(docker inspect "${container_id}" --format '{{.State.Status}}')"
      health="$(docker inspect "${container_id}" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
      if [[ "${state}" == "running" && ("${health}" == "healthy" || "${health}" == "none") ]]; then
        return 0
      fi
    fi
    sleep 2
  done

  echo "Service ${service} did not become healthy in time." >&2
  return 1
}

ensure_redis_internal_only() {
  local container_id
  local port_bindings

  container_id="$("${COMPOSE[@]}" ps -q redis)"
  if [[ -n "${container_id}" ]]; then
    port_bindings="$(docker inspect "${container_id}" --format '{{json .HostConfig.PortBindings}}')"
    if python3 - "${port_bindings}" <<'PY'
import json
import sys

raise SystemExit(0 if not (json.loads(sys.argv[1]) or {}) else 1)
PY
    then
      wait_for_service_health redis
      return 0
    fi

    echo "Redis still publishes a host port; recreating it on the internal Compose network..."
  else
    echo "Redis is not created; starting it on the internal Compose network..."
  fi

  # Recreating the container preserves the named redis-data volume while
  # applying the effective Compose configuration without a host port binding.
  "${COMPOSE[@]}" up -d --no-deps --force-recreate redis
  wait_for_service_health redis
}

prepare_identity_infrastructure() {
  echo "Applying PostgreSQL migrations before loading the identity dictionary..."
  "${COMPOSE[@]}" run --rm --no-deps --entrypoint sh backend -lc 'npm run db:migrate'

  echo "Recreating ClickHouse with the PostgreSQL-backed identity dictionary..."
  "${COMPOSE[@]}" up -d --no-deps --force-recreate clickhouse
  wait_for_service_health clickhouse

  printf '%s\n' "SELECT dictGetOrDefault('user_identity_dict', 'user_id', tuple(toUInt64(0), ''), '')" | \
    docker exec -i clickhouse sh -lc \
      'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB"' \
      >/dev/null
}

switch_to_branch() {
  local remote_sha

  git fetch "${DEPLOY_REMOTE}" --prune

  remote_sha="$(git rev-parse "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}")"
  if [[ -n "${EXPECTED_GIT_SHA}" && "${remote_sha}" != "${EXPECTED_GIT_SHA}" ]]; then
    echo "Refusing deployment: ${DEPLOY_REMOTE}/${DEPLOY_BRANCH} is ${remote_sha}, expected ${EXPECTED_GIT_SHA}." >&2
    return 1
  fi

  if git show-ref --verify --quiet "refs/heads/${DEPLOY_BRANCH}"; then
    git switch "${DEPLOY_BRANCH}"
  else
    git switch --track -c "${DEPLOY_BRANCH}" "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
  fi

  git merge --ff-only "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"

  if [[ -n "${EXPECTED_GIT_SHA}" && "$(git rev-parse HEAD)" != "${EXPECTED_GIT_SHA}" ]]; then
    echo "Refusing deployment: checked out HEAD does not match ${EXPECTED_GIT_SHA}." >&2
    return 1
  fi
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
    "${COMPOSE[@]}" up -d --no-deps --force-recreate backend client

  if ! rollback_response="$(wotcv_wait_for_health "${HEALTHCHECK_URL}" "${previous_git_sha}" "${previous_tag}")"; then
    echo "Rollback health check failed; manual intervention is required." >&2
    return 1
  fi

  if [[ "${rollback_response}" != *"\"gitSha\":\"${previous_git_sha}\""* ]]; then
    echo "Rollback returned an unexpected git SHA: ${rollback_response}" >&2
    return 1
  fi

  echo "Rollback completed: ${previous_tag}" >&2
}

PREVIOUS_TAG="$(wotcv_read_state "${STATE_FILE}" LAST_IMAGE_TAG)"
PREVIOUS_GIT_SHA="$(wotcv_read_state "${STATE_FILE}" LAST_GIT_SHA)"
PREVIOUS_BUILD_TIME="$(wotcv_read_state "${STATE_FILE}" BUILD_TIME)"
PREVIOUS_BACKEND_DIGEST="$(wotcv_read_state "${STATE_FILE}" BACKEND_IMAGE_DIGEST)"
PREVIOUS_CLIENT_DIGEST="$(wotcv_read_state "${STATE_FILE}" CLIENT_IMAGE_DIGEST)"

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
COMPOSE_CONFIG_FILE="$(mktemp "${TMPDIR:-/tmp}/rybbit-wotcv-branch-build-compose.${UID}.XXXXXX.json")"
"${COMPOSE[@]}" config --format json >"${COMPOSE_CONFIG_FILE}"
validate_compose_config
ensure_redis_internal_only
validate_infrastructure

BUILD_COMMAND=(build)
if [[ "${WOTCV_BUILD_PULL:-0}" == "1" ]]; then
  BUILD_COMMAND+=(--pull)
fi

echo "Building backend and client locally from ${DEPLOY_BRANCH}..."
"${COMPOSE[@]}" "${BUILD_COMMAND[@]}" backend client

echo "Validating runtime contents of backend and client images..."
validate_runtime_images

prepare_identity_infrastructure
validate_infrastructure

BACKEND_IMAGE_DIGEST="$(image_id "${BACKEND_IMAGE}" "${IMAGE_TAG}")"
CLIENT_IMAGE_DIGEST="$(image_id "${CLIENT_IMAGE}" "${IMAGE_TAG}")"
export BACKEND_IMAGE_DIGEST CLIENT_IMAGE_DIGEST

echo "Starting backend and client..."
if ! "${COMPOSE[@]}" up -d --no-deps --force-recreate backend client; then
  echo "Compose startup failed. Attempting rollback..." >&2
  rollback "${PREVIOUS_TAG}" "${PREVIOUS_GIT_SHA}" "${PREVIOUS_BUILD_TIME}" "${PREVIOUS_BACKEND_DIGEST}" "${PREVIOUS_CLIENT_DIGEST}" || true
  exit 1
fi

if ! HEALTH_RESPONSE="$(wotcv_wait_for_health "${HEALTHCHECK_URL}" "${WOTCV_GIT_SHA}" "${IMAGE_TAG}")"; then
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

echo "Running Identity Resolution v2 post-deployment preflight..."
if ! bash scripts/wotcv-identity-v2-preflight.sh; then
  echo "Identity preflight failed. Attempting application rollback..." >&2
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
