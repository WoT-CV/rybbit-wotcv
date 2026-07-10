#!/usr/bin/env bash

set -Eeuo pipefail

API_BASE_URL="${WOTCV_API_BASE_URL:-http://127.0.0.1:3001/api}"
SITE_ID="${WOTCV_SITE_ID:-}"
PRIVATE_KEY="${WOTCV_PRIVATE_KEY:-}"
API_KEY="${WOTCV_API_KEY:-}"
TIME_ZONE="${WOTCV_TIME_ZONE:-Europe/Warsaw}"
START_DATE="${WOTCV_START_DATE:-$(date -u -d '6 days ago' +%F 2>/dev/null || date -u +%F)}"
END_DATE="${WOTCV_END_DATE:-$(date -u +%F)}"
BUCKET="${WOTCV_BUCKET:-hour}"

if [[ -z "${SITE_ID}" ]]; then
  echo "WOTCV_SITE_ID is required." >&2
  echo "Example: WOTCV_SITE_ID=123 bash scripts/wotcv-self-hosted-analytics-smoke.sh" >&2
  exit 2
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

HEADERS=()
if [[ -n "${PRIVATE_KEY}" ]]; then
  HEADERS+=(-H "x-private-key: ${PRIVATE_KEY}")
fi
if [[ -n "${API_KEY}" ]]; then
  HEADERS+=(-H "Authorization: Bearer ${API_KEY}")
fi

COMMON_QUERY=(
  --data-urlencode "start_date=${START_DATE}"
  --data-urlencode "end_date=${END_DATE}"
  --data-urlencode "time_zone=${TIME_ZONE}"
)

request() {
  local label="$1"
  local path="$2"
  shift 2

  local url="${API_BASE_URL%/}${path}"
  local body_file
  local status
  body_file="$(mktemp)"

  if ! status="$(curl --silent --show-error --output "${body_file}" --write-out "%{http_code}" --get "${HEADERS[@]}" "${url}" "$@")"; then
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

echo "Checking WoT-CV analytics endpoints"
echo "API base: ${API_BASE_URL%/}"
echo "Site ID: ${SITE_ID}"
echo "Range: ${START_DATE}..${END_DATE} (${TIME_ZONE})"

request "health" "/health"

request "pages: page titles" "/sites/${SITE_ID}/page-titles" \
  "${COMMON_QUERY[@]}" \
  --data-urlencode "limit=1" \
  --data-urlencode "page=1"

request "performance: overview" "/sites/${SITE_ID}/performance/overview" \
  "${COMMON_QUERY[@]}"

request "performance: time series" "/sites/${SITE_ID}/performance/time-series" \
  "${COMMON_QUERY[@]}" \
  --data-urlencode "bucket=${BUCKET}"

request "performance: by pathname" "/sites/${SITE_ID}/performance/by-dimension" \
  "${COMMON_QUERY[@]}" \
  --data-urlencode "dimension=pathname" \
  --data-urlencode "limit=1" \
  --data-urlencode "page=1"

request "bots: overview" "/sites/${SITE_ID}/bots/overview" \
  "${COMMON_QUERY[@]}"

request "bots: time series" "/sites/${SITE_ID}/bots/time-series" \
  "${COMMON_QUERY[@]}" \
  --data-urlencode "bucket=${BUCKET}"

request "bots: by pathname" "/sites/${SITE_ID}/bots/by-dimension" \
  "${COMMON_QUERY[@]}" \
  --data-urlencode "dimension=pathname" \
  --data-urlencode "limit=1" \
  --data-urlencode "page=1"

echo "Self-hosted analytics smoke check completed."
