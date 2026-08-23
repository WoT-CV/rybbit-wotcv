#!/usr/bin/env bash

set -Eeuo pipefail

WOTCV_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WOTCV_PERSISTENCE_HELPER="${WOTCV_COMMON_DIR}/wotcv_persistence.py"

wotcv_require_non_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    echo "Run this script as the deployment user, without sudo." >&2
    return 1
  fi
}

wotcv_require_commands() {
  local command_name

  for command_name in "$@"; do
    command -v "${command_name}" >/dev/null 2>&1 || {
      echo "${command_name} is required." >&2
      return 1
    }
  done
}

wotcv_require_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree must be clean before deployment." >&2
    return 1
  fi
}

wotcv_require_expected_compose_project() {
  local actual_project="$1"
  local expected_project="$2"

  if [[ -z "${expected_project}" ]]; then
    echo "WOTCV_EXPECTED_COMPOSE_PROJECT_NAME cannot be empty." >&2
    return 1
  fi

  if [[ "${actual_project}" != "${expected_project}" ]]; then
    echo "Refusing deployment: Compose project is '${actual_project}', expected '${expected_project}'." >&2
    return 1
  fi
}

wotcv_validate_compose_persistence() {
  local config_file="$1"
  local expected_project="$2"
  local clickhouse_volume="$3"
  local postgres_volume="$4"
  local redis_volume="$5"

  python3 "${WOTCV_PERSISTENCE_HELPER}" validate-config \
    --config "${config_file}" \
    --expected-project "${expected_project}" \
    --clickhouse-volume "${clickhouse_volume}" \
    --postgres-volume "${postgres_volume}" \
    --redis-volume "${redis_volume}"
}

wotcv_require_named_volume() {
  local volume_name="$1"

  if ! docker volume inspect "${volume_name}" >/dev/null 2>&1; then
    echo "Refusing deployment: required external volume '${volume_name}' does not exist." >&2
    return 1
  fi
}

wotcv_validate_container_persistence() {
  local container_id="$1"
  local service_name="$2"
  local expected_project="$3"
  local expected_volume="$4"
  local target="$5"
  local actual_project
  local mounts_json

  if [[ -z "${container_id}" ]]; then
    echo "Refusing deployment: ${service_name} container does not exist." >&2
    return 1
  fi

  actual_project="$(docker inspect "${container_id}" \
    --format '{{index .Config.Labels "com.docker.compose.project"}}')"
  mounts_json="$(docker inspect "${container_id}" --format '{{json .Mounts}}')"

  python3 "${WOTCV_PERSISTENCE_HELPER}" validate-container \
    --service "${service_name}" \
    --actual-project "${actual_project}" \
    --expected-project "${expected_project}" \
    --expected-volume "${expected_volume}" \
    --target "${target}" \
    --mounts-json "${mounts_json}"
}

wotcv_clickhouse_event_invariants() {
  local container_id="$1"
  local core_invariants
  local query
  local v2_exists
  local v2_sessions=0

  if [[ -z "${container_id}" ]]; then
    echo "Cannot read ClickHouse event invariants: container does not exist." >&2
    return 1
  fi

  query="SELECT
    (SELECT count() FROM events),
    (SELECT if(count() = 0, 0, toUnixTimestamp(min(timestamp))) FROM events),
    (SELECT if(count() = 0, 0, toUnixTimestamp(max(timestamp))) FROM events),
    (SELECT uniqExact(tuple(site_id, session_id)) FROM events),
    (SELECT uniqExact(tuple(site_id, toDate(timestamp), session_id)) FROM events),
    (SELECT count() FROM session_replay_events),
    (SELECT uniqExact(tuple(site_id, session_id)) FROM session_replay_events),
    (SELECT uniqExact(tuple(site_id, session_id)) FROM session_replay_metadata FINAL)
  FORMAT TSVRaw"
  core_invariants="$(printf '%s\n' "${query}" | docker exec -i "${container_id}" sh -lc \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB"')"

  v2_exists="$(printf '%s\n' 'EXISTS TABLE session_replay_metadata_v2 FORMAT TSVRaw' | \
    docker exec -i "${container_id}" sh -lc \
      'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB"')"
  if [[ "${v2_exists}" == "1" ]]; then
    v2_sessions="$(printf '%s\n' \
      'SELECT uniqExact(tuple(site_id, session_id)) FROM session_replay_metadata_v2 FINAL FORMAT TSVRaw' | \
      docker exec -i "${container_id}" sh -lc \
        'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database "$CLICKHOUSE_DB"')"
  fi

  printf '%s\t%s\n' "${core_invariants}" "${v2_sessions}"
}

wotcv_assert_clickhouse_event_invariants_not_decreased() {
  local before="$1"
  local after="$2"

  python3 "${WOTCV_PERSISTENCE_HELPER}" compare-events \
    --before "${before}" \
    --after "${after}"
}

wotcv_postgres_data_invariants() {
  local container_id="$1"
  local query

  if [[ -z "${container_id}" ]]; then
    echo "Cannot read PostgreSQL invariants: container does not exist." >&2
    return 1
  fi

  query='SELECT (SELECT count(*) FROM "user"), (SELECT count(*) FROM sites);'
  printf '%s\n' "${query}" | docker exec -i "${container_id}" sh -lc \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F " "'
}

wotcv_assert_postgres_invariants_not_decreased() {
  local before="$1"
  local after="$2"

  python3 "${WOTCV_PERSISTENCE_HELPER}" compare-postgres \
    --before "${before}" \
    --after "${after}"
}

wotcv_read_state() {
  local state_file="$1"
  local key="$2"

  [[ -f "${state_file}" ]] || return 0
  sed -n "s/^${key}=//p" "${state_file}" | tail -n 1
}

wotcv_wait_for_health() {
  local healthcheck_url="$1"
  local expected_git_sha="${2:-}"
  local expected_image_tag="${3:-}"
  local attempts="${WOTCV_HEALTHCHECK_ATTEMPTS:-60}"
  local response
  local last_response=""

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if response="$(curl --fail --silent --show-error --max-time 5 "${healthcheck_url}" 2>/dev/null)"; then
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

  [[ -z "${last_response}" ]] || printf '%s\n' "${last_response}"
  return 1
}
