#!/usr/bin/env bash

# No database writes here. The caller owns the migration and its data guards.
# Explicit returns are required even when invoked in an if/command substitution.
WOTCV_AUTH_CUTOVER_STARTED=0

wotcv_auth_query() {
  local container_id="$1"
  [[ -n "${container_id}" ]] || return 1
  docker exec -i "${container_id}" sh -lc \
    'PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=30000" psql -XqAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

wotcv_auth_schema_state() {
  local container_id="$1"
  local journal_exists migration_hash migration_time migration_info result
  journal_exists="$(printf "%s\n" "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL;" | wotcv_auth_query "${container_id}")" || return 1
  if [[ "${journal_exists}" != t ]]; then
    echo "Auth preflight requires the existing Drizzle migration journal; refusing an untracked database." >&2
    return 1
  fi
  migration_info="$(python3 - "${ROOT_DIR}" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1]) / "server" / "drizzle"
entry = next(x for x in json.loads((root / "meta/_journal.json").read_text())["entries"] if x["tag"] == "0018_better_auth_173")
content = (root / (entry["tag"] + ".sql")).read_bytes()
print(hashlib.sha256(content).hexdigest(), entry["when"])
PY
)" || return 1
  read -r migration_hash migration_time <<<"${migration_info}"
  [[ "${migration_hash}" =~ ^[0-9a-f]{64}$ && "${migration_time}" =~ ^[0-9]+$ ]] || return 1
  result="$(printf "%s\n" "SELECT CASE WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '${migration_hash}' AND created_at = ${migration_time}) THEN 'current' WHEN EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at >= ${migration_time}) THEN 'diverged' ELSE 'pending' END;" | wotcv_auth_query "${container_id}")" || return 1
  case "${result}" in
    current|pending) printf '%s\n' "${result}" ;;
    *) echo "Unrecognized or divergent auth migration history; manual review required." >&2; return 1 ;;
  esac
}

wotcv_auth_data_preflight() {
  local container_id="$1"
  local preflight result
  # The opening upstream block only validates accounts and parses metadata.
  preflight="$(python3 - "${ROOT_DIR}/server/drizzle/0018_better_auth_173.sql" <<'PY'
import pathlib, sys
block = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").split("--> statement-breakpoint", 1)[0]
if not block.rstrip().endswith("END $$;"):
    raise SystemExit("Unexpected auth preflight block")
print(block)
PY
)" || return 1
  result="$(printf '%s\n' "BEGIN READ ONLY;" "${preflight}" "SELECT 'auth-preflight-ok';" "COMMIT;" | wotcv_auth_query "${container_id}")" || return 1
  [[ "${result}" == auth-preflight-ok ]] || return 1
}

wotcv_auth_require_cutover_ack() {
  if [[ "${WOTCV_AUTH_CUTOVER_ACK:-}" != backup-verified-writers-reviewed ]]; then
    echo "Better Auth 1.7 cutover needs a maintenance window, verified PostgreSQL backup and review of ALL old writers." >&2
    echo "See docs/WOTCV_AUTH_CUTOVER.md; set WOTCV_AUTH_CUTOVER_ACK=backup-verified-writers-reviewed and WOTCV_AUTH_BACKUP_FILE." >&2
    return 1
  fi
  python3 - "${WOTCV_AUTH_BACKUP_FILE:-}" <<'PY'
import pathlib, sys, time
path = pathlib.Path(sys.argv[1])
if not sys.argv[1] or not path.is_absolute() or not path.is_file():
    raise SystemExit("WOTCV_AUTH_BACKUP_FILE must be an absolute path to the verified PostgreSQL backup")
stat = path.stat()
if stat.st_size == 0 or not 0 <= time.time() - stat.st_mtime <= 86400:
    raise SystemExit("The verified backup must be nonempty and less than 24 hours old")
PY
}

wotcv_auth_image_version() {
  docker run --rm --network none --entrypoint node "$1" \
    -p "require('/app/node_modules/better-auth/package.json').version"
}

wotcv_auth_prepare_cutover() {
  local container_id="$1"
  local schema_state backend_id running version
  schema_state="$(wotcv_auth_schema_state "${container_id}")" || return 1
  backend_id="$("${COMPOSE[@]}" ps -a -q backend)" || return 1
  # This fork uses exactly one backend container (cluster workers live inside).
  [[ -n "${backend_id}" && "${backend_id}" != *$'\n'* ]] || {
    echo "Expected exactly one existing backend; manual auth cutover review required." >&2
    return 1
  }
  if [[ "${schema_state}" == current ]]; then
    running="$(docker inspect "${backend_id}" --format '{{.State.Running}}')" || return 1
    if [[ "${running}" == true ]]; then
      version="$(docker exec "${backend_id}" node -p "require('/app/node_modules/better-auth/package.json').version")" || return 1
      if [[ "${version}" != 1.7.3 ]]; then
        echo "Auth schema is already upgraded but running workers differ from 1.7.3. Review rollback writes and reconcile teams/clients before retrying." >&2
        return 1
      fi
    elif [[ "${running}" != false ]]; then
      return 1
    fi
    return 0
  fi
  wotcv_auth_data_preflight "${container_id}" || return 1
  wotcv_auth_require_cutover_ack || return 1
  echo "Stopping old backend workers for the Better Auth 1.7 cutover..."
  WOTCV_AUTH_CUTOVER_STARTED=1
  "${COMPOSE[@]}" stop --timeout 60 backend || return 1
  running="$(docker inspect "${backend_id}" --format '{{.State.Running}} {{.State.ExitCode}}')" || return 1
  if [[ ! "${running}" =~ ^false\ [0-9]+$ || "${running}" == "false 137" ]]; then
    echo "Backend did not stop cleanly. No migration will run; inspect workers before retrying." >&2
    return 1
  fi
  # Validate again after draining: no account/client writes may race the copy.
  wotcv_auth_data_preflight "${container_id}" || return 1
}

wotcv_auth_assert_rollback_safe() {
  local schema_state version
  schema_state="$(wotcv_auth_schema_state "$2")" || return 1
  if [[ "${schema_state}" == current ]]; then
    version="$(wotcv_auth_image_version "$1")" || return 1
    if [[ "${version}" != 1.7.3 ]]; then
      echo "Automatic rollback across the Better Auth 1.7 boundary is BLOCKED: legacy OAuth tokens could become valid again." >&2
      echo "Keep maintenance restrictions and follow docs/WOTCV_AUTH_CUTOVER.md. Database data was not rolled back." >&2
      return 1
    fi
  fi
}
