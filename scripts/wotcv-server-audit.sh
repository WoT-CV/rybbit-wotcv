#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
AUDIT_DIR="${WOTCV_AUDIT_DIR:-${ROOT_DIR}/wotcv-server-audit-${TIMESTAMP}}"
INCLUDE_LOGS="${WOTCV_AUDIT_INCLUDE_LOGS:-0}"
COMMAND_TIMEOUT_SECONDS="${WOTCV_AUDIT_TIMEOUT_SECONDS:-60}"

mkdir -p "${AUDIT_DIR}"
cd "${ROOT_DIR}"

printf 'Writing audit to %s\n' "${AUDIT_DIR}" >&2
printf 'Command timeout: %ss\n' "${COMMAND_TIMEOUT_SECONDS}" >&2

redact_stream() {
  sed -E \
    -e 's/([A-Za-z0-9_]*(PASSWORD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)[A-Za-z0-9_]*[=:][[:space:]]*)[^[:space:]"]+/\1<redacted>/Ig' \
    -e 's/([A-Za-z0-9_]*(PASSWORD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)[A-Za-z0-9_]*:[[:space:]]*).*/\1<redacted>/Ig' \
    -e 's/(Authorization:[[:space:]]*).*/\1<redacted>/Ig' \
    -e 's/(Bearer )[A-Za-z0-9._~+\/=-]+/\1<redacted>/Ig'
}

write_command() {
  local output_name="$1"
  shift

  printf 'Collecting %s...\n' "${output_name}" >&2

  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
    if command -v timeout >/dev/null 2>&1; then
      timeout "${COMMAND_TIMEOUT_SECONDS}" "$@"
    else
      "$@"
    fi
  } >"${AUDIT_DIR}/${output_name}.txt" 2>&1 || {
    local exit_code=$?
    printf '\n[command exited with code %s]\n' "${exit_code}" >>"${AUDIT_DIR}/${output_name}.txt"
  }

  redact_stream <"${AUDIT_DIR}/${output_name}.txt" >"${AUDIT_DIR}/${output_name}.redacted"
  mv "${AUDIT_DIR}/${output_name}.redacted" "${AUDIT_DIR}/${output_name}.txt"
}

write_shell() {
  local output_name="$1"
  local shell_command="$2"

  printf 'Collecting %s...\n' "${output_name}" >&2

  {
    printf '$ %s\n\n' "${shell_command}"
    if command -v timeout >/dev/null 2>&1; then
      timeout "${COMMAND_TIMEOUT_SECONDS}" bash -lc "${shell_command}"
    else
      bash -lc "${shell_command}"
    fi
  } >"${AUDIT_DIR}/${output_name}.txt" 2>&1 || {
    local exit_code=$?
    printf '\n[command exited with code %s]\n' "${exit_code}" >>"${AUDIT_DIR}/${output_name}.txt"
  }

  redact_stream <"${AUDIT_DIR}/${output_name}.txt" >"${AUDIT_DIR}/${output_name}.redacted"
  mv "${AUDIT_DIR}/${output_name}.redacted" "${AUDIT_DIR}/${output_name}.txt"
}

copy_redacted_file() {
  local source_file="$1"
  local target_file="$2"

  if [[ -f "${source_file}" ]]; then
    printf 'Copying %s...\n' "${source_file}" >&2
    redact_stream <"${source_file}" >"${AUDIT_DIR}/${target_file}"
  fi
}

write_command 00-system-date date -u
write_command 01-hostname hostname
write_command 02-uname uname -a
write_command 03-user id
write_command 04-working-directory pwd
write_command 05-root-listing ls -la
write_shell 06-selected-environment 'printenv | sort'

write_command 10-git-status git status --short --branch
write_command 11-git-remotes git remote -v
write_command 12-git-branch git branch --show-current
write_command 13-git-head git rev-parse HEAD
write_shell 14-git-branches 'git branch -vv --all'
write_shell 15-git-recent-log 'git log --oneline --decorate --graph -n 30'
write_shell 16-git-tags 'git tag --sort=-creatordate | head -30'

shopt -s nullglob
for compose_file in docker-compose*.yml docker-compose*.yaml; do
  copy_redacted_file "${compose_file}" "20-file-${compose_file//\//_}"
done

for env_file in .env .env.*; do
  [[ -f "${env_file}" ]] || continue
  copy_redacted_file "${env_file}" "21-file-${env_file//\//_}"
done

copy_redacted_file Caddyfile 22-file-Caddyfile

if command -v docker >/dev/null 2>&1; then
  write_command 30-docker-version docker version
  write_command 31-docker-info docker info

  if docker compose version >/dev/null 2>&1; then
    write_command 32-compose-version docker compose version
    write_command 33-compose-ls docker compose ls
    write_command 34-compose-ps docker compose ps
    write_shell 35-compose-config 'docker compose config'
    write_shell 36-compose-services 'docker compose config --services'
    write_shell 37-compose-volumes 'docker compose config --volumes'

    if [[ "${INCLUDE_LOGS}" == "1" ]]; then
      write_shell 38-compose-logs 'docker compose logs --since=30m --tail=300 backend client'
    else
      printf 'Logs were skipped. Re-run with WOTCV_AUDIT_INCLUDE_LOGS=1 if logs are needed.\n' >"${AUDIT_DIR}/38-compose-logs.txt"
    fi
  fi

  write_command 40-docker-containers docker ps --all
  write_command 41-docker-images docker images --digests
  write_command 42-docker-volumes docker volume ls
  write_command 43-docker-networks docker network ls

  for container_name in backend client postgres clickhouse redis caddy; do
    if docker inspect "${container_name}" >/dev/null 2>&1; then
      write_command "44-inspect-${container_name}" docker inspect "${container_name}"
    fi
  done
fi

if command -v ss >/dev/null 2>&1; then
  write_shell 50-listening-ports 'ss -tulpn'
elif command -v netstat >/dev/null 2>&1; then
  write_shell 50-listening-ports 'netstat -tulpn'
fi

if command -v curl >/dev/null 2>&1; then
  HEALTHCHECK_URL="${WOTCV_HEALTHCHECK_URL:-http://127.0.0.1:3001/api/health}"
  write_shell 60-health "curl -fsS --max-time 5 '${HEALTHCHECK_URL}'"
fi

cat >"${AUDIT_DIR}/README.txt" <<EOF
WoT-CV Rybbit server audit
Generated: ${TIMESTAMP}
Directory: ${AUDIT_DIR}

This audit is read-only. It redacts common secret, token, password, key and auth fields.

Recommended files to paste back first:
- 10-git-status.txt
- 11-git-remotes.txt
- 12-git-branch.txt
- 13-git-head.txt
- 34-compose-ps.txt
- 35-compose-config.txt
- 60-health.txt

Logs are excluded by default. To include recent backend/client logs:
WOTCV_AUDIT_INCLUDE_LOGS=1 bash scripts/wotcv-server-audit.sh
EOF

if command -v tar >/dev/null 2>&1; then
  ARCHIVE_PATH="${AUDIT_DIR}.tar.gz"
  tar -czf "${ARCHIVE_PATH}" -C "$(dirname "${AUDIT_DIR}")" "$(basename "${AUDIT_DIR}")"
  printf 'Audit archive: %s\n' "${ARCHIVE_PATH}"
else
  printf 'Audit directory: %s\n' "${AUDIT_DIR}"
fi
