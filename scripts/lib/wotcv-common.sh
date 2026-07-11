#!/usr/bin/env bash

set -Eeuo pipefail

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
