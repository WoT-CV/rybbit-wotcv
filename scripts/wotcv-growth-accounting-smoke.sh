#!/usr/bin/env bash

set -Eeuo pipefail

BASE_URL="${WOTCV_BASE_URL:-http://127.0.0.1:3001}"
SITE_ID="${WOTCV_SITE_ID:?Set WOTCV_SITE_ID to the numeric Rybbit site ID}"
TIME_ZONE="${WOTCV_TIME_ZONE:-Europe/Warsaw}"
AUTH_COOKIE="${WOTCV_AUTH_COOKIE:-}"

command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 1
}

curl_args=(
  --fail-with-body
  --silent
  --show-error
  --max-time 30
  --header "Accept: application/json"
)

if [[ -n "${AUTH_COOKIE}" ]]; then
  curl_args+=(--header "Cookie: ${AUTH_COOKIE}")
fi

for range in 30 90 365; do
  response_file="$(mktemp)"
  trap 'rm -f "${response_file}"' EXIT

  endpoint="${BASE_URL%/}/sites/${SITE_ID}/growth-accounting?mode=week&range=${range}&timeZone=${TIME_ZONE}"
  metrics="$(curl "${curl_args[@]}" --output "${response_file}" --write-out '%{http_code} %{time_total}' "${endpoint}")"
  read -r status_code total_time <<<"${metrics}"

  echo "range=${range} status=${status_code} time=${total_time}s"
  if command -v jq >/dev/null 2>&1; then
    jq '{mode, range, periods: (.data | length), latest: .data[-1]}' "${response_file}"
  else
    head -c 500 "${response_file}"
    echo
  fi

  rm -f "${response_file}"
  trap - EXIT
done
