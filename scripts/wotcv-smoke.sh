#!/usr/bin/env bash

set -Eeuo pipefail

MODE="${1:-all}"
API_BASE_URL="${WOTCV_API_BASE_URL:-http://127.0.0.1:3001/api}"
SITE_ID="${WOTCV_SITE_ID:-}"
PRIVATE_KEY="${WOTCV_PRIVATE_KEY:-}"
API_KEY="${WOTCV_API_KEY:-}"
AUTH_COOKIE="${WOTCV_AUTH_COOKIE:-}"
TIME_ZONE="${WOTCV_TIME_ZONE:-Europe/Warsaw}"
START_DATE="${WOTCV_START_DATE:-$(date -u -d '6 days ago' +%F 2>/dev/null || date -u +%F)}"
END_DATE="${WOTCV_END_DATE:-$(date -u +%F)}"
BUCKET="${WOTCV_BUCKET:-hour}"

if [[ ! "${MODE}" =~ ^(all|analytics|growth|source)$ ]]; then
  echo "Usage: WOTCV_SITE_ID=<id> $0 [all|analytics|growth|source]" >&2
  exit 2
fi

if [[ "${MODE}" != "source" && -z "${SITE_ID}" ]]; then
  echo "WOTCV_SITE_ID is required." >&2
  exit 2
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

HEADERS=(--header "Accept: application/json")
[[ -z "${PRIVATE_KEY}" ]] || HEADERS+=(--header "x-private-key: ${PRIVATE_KEY}")
[[ -z "${API_KEY}" ]] || HEADERS+=(--header "Authorization: Bearer ${API_KEY}")
[[ -z "${AUTH_COOKIE}" ]] || HEADERS+=(--header "Cookie: ${AUTH_COOKIE}")

COMMON_QUERY=(
  --data-urlencode "start_date=${START_DATE}"
  --data-urlencode "end_date=${END_DATE}"
  --data-urlencode "time_zone=${TIME_ZONE}"
)

request() {
  local label="$1"
  local path="$2"
  shift 2

  local body_file
  local status
  body_file="$(mktemp)"

  if ! status="$(curl --silent --show-error --max-time 30 --output "${body_file}" --write-out "%{http_code}" --get "${HEADERS[@]}" "${API_BASE_URL%/}${path}" "$@")"; then
    echo "FAIL ${label}: curl failed" >&2
    rm -f "${body_file}"
    return 1
  fi

  if [[ "${status}" =~ ^2 ]]; then
    printf 'OK   %s (%s)\n' "${label}" "${status}"
    head -c 240 "${body_file}"
    printf '\n'
    rm -f "${body_file}"
    return 0
  fi

  printf 'FAIL %s (%s)\n' "${label}" "${status}" >&2
  cat "${body_file}" >&2
  printf '\n' >&2
  rm -f "${body_file}"
  return 1
}

check_analytics() {
  request "pages: page titles" "/sites/${SITE_ID}/page-titles" "${COMMON_QUERY[@]}" --data-urlencode "limit=1" --data-urlencode "page=1"
  request "performance: overview" "/sites/${SITE_ID}/performance/overview" "${COMMON_QUERY[@]}"
  request "performance: time series" "/sites/${SITE_ID}/performance/time-series" "${COMMON_QUERY[@]}" --data-urlencode "bucket=${BUCKET}"
  request "performance: by pathname" "/sites/${SITE_ID}/performance/by-dimension" "${COMMON_QUERY[@]}" --data-urlencode "dimension=pathname" --data-urlencode "limit=1" --data-urlencode "page=1"
  request "bots: overview" "/sites/${SITE_ID}/bots/overview" "${COMMON_QUERY[@]}"
  request "bots: time series" "/sites/${SITE_ID}/bots/time-series" "${COMMON_QUERY[@]}" --data-urlencode "bucket=${BUCKET}"
  request "bots: by pathname" "/sites/${SITE_ID}/bots/by-dimension" "${COMMON_QUERY[@]}" --data-urlencode "dimension=pathname" --data-urlencode "limit=1" --data-urlencode "page=1"
}

check_growth() {
  local range

  for range in 30 90 365; do
    request "growth accounting: ${range} days" "/sites/${SITE_ID}/growth-accounting" \
      --data-urlencode "mode=week" \
      --data-urlencode "range=${range}" \
      --data-urlencode "timeZone=${TIME_ZONE}"
  done
}

check_source() {
  local health_headers_file
  local headers_file
  local status
  health_headers_file="$(mktemp)"
  headers_file="$(mktemp)"

  curl --fail --silent --show-error --max-time 15 --output /dev/null --dump-header "${health_headers_file}" "${API_BASE_URL%/}/health"
  status="$(curl --silent --show-error --max-time 15 --output /dev/null --dump-header "${headers_file}" --write-out "%{http_code}" "${API_BASE_URL%/}/source")"
  if ! grep -Eiq '^link: <https?://.+/tree/(feat/wotcv|[0-9a-f]{7,40})>; rel="source"' "${health_headers_file}" ||
    ! grep -Eiq '^x-source-code: https?://.+/tree/(feat/wotcv|[0-9a-f]{7,40})' "${health_headers_file}" ||
    [[ ! "${status}" =~ ^3 ]] ||
    ! grep -Eiq '^location: https?://.+/tree/(feat/wotcv|[0-9a-f]{7,40})' "${headers_file}"; then
    echo "FAIL source availability (${status})" >&2
    cat "${health_headers_file}" >&2
    cat "${headers_file}" >&2
    rm -f "${health_headers_file}"
    rm -f "${headers_file}"
    return 1
  fi

  echo "OK   source availability (${status})"
  grep -Ei '^location:' "${headers_file}"
  rm -f "${health_headers_file}"
  rm -f "${headers_file}"
}

echo "Checking WoT-CV endpoints (${MODE})"
echo "API base: ${API_BASE_URL%/}"
[[ -z "${SITE_ID}" ]] || echo "Site ID: ${SITE_ID}"
request "health" "/health"

if [[ "${MODE}" == "source" ]]; then
  check_source
else
  [[ "${MODE}" == "growth" ]] || check_analytics
  [[ "${MODE}" == "analytics" ]] || check_growth
  [[ "${MODE}" != "all" ]] || check_source
fi

echo "WoT-CV smoke check completed."
