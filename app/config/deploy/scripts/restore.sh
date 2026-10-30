#!/usr/bin/env bash
# Restore (NFR-15, TE-03): loads a backup into a database.
# Usage: restore.sh <backup.dump> [target-database]
# Environment: DEPLOY_ENV_FILE names the env file (default config/deploy/.env if present, empty or missing = none); PG_EXEC overrides how the Postgres container is reached (for tests).
# Without a target database the production database (POSTGRES_DB) is overwritten; that requires CONFIRM=yes.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:-}"
if [ -z "$file" ] || [ ! -s "$file" ]; then echo "usage: restore.sh <backup.dump> [target-database]" >&2; exit 2; fi

# DEPLOY_ENV_FILE (#1010) names the env file: default .env in this folder; empty or missing loads none, so a caller
# can keep the host's .env out of a run (restore-test does).
env_file="${DEPLOY_ENV_FILE-.env}"
compose_env=""
if [ -n "$env_file" ] && [ -f "$env_file" ]; then
  case "$env_file" in /* | ./*) env_path="$env_file" ;; *) env_path="./$env_file" ;; esac # `.` would search $PATH for a bare name
  set -a
  # shellcheck source=/dev/null
  . "$env_path"
  set +a
  compose_env="--env-file $env_file"
fi
PG_EXEC="${PG_EXEC:-docker compose $compose_env exec -T db}"
RESTORE_DB="${2:-}"
KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"

# A keycloak-*.dump belongs to the sign-in service database (TE-03); it keeps its owner (the sign-in role), the
# app dump is restored without owners. Without a target the production database of that kind is overwritten.
# The app dump is restored as the schema owner role (DB_OWNER_USER, #907): without it the objects would belong to the
# cluster superuser, and every `security definer` function would ignore row-level security again. The role must exist
# (created by the `db-roles` one-shot on `docker compose up`).
OWNER_OPTION=--no-owner
OWNER_ROLE="${DB_OWNER_USER-pflanzendex_owner}" # default as in docker-compose.yml; explicitly empty = legacy, objects stay with the superuser
PRODUCTION_DB=""
case "$(basename "$file")" in
  keycloak-*) OWNER_OPTION=""; OWNER_ROLE=""; PRODUCTION_DB="$KEYCLOAK_DB_NAME" ;;
esac

if [ -z "$RESTORE_DB" ]; then
  if [ "${CONFIRM:-}" != "yes" ]; then
    echo "This overwrites the production database (stop the services that use it first). Confirm with CONFIRM=yes or pass a target database." >&2
    exit 2
  fi
fi

# Create the target database if it differs from the production database, then restore into it.
# An empty production name means the app database ($POSTGRES_DB inside the container).
$PG_EXEC sh -c '
  set -e
  db="${1:-${3:-$POSTGRES_DB}}"
  owner_clause=""
  role_option=""
  if [ -n "$4" ]; then owner_clause="OWNER \"$4\""; role_option="--role=$4"; fi
  if [ "$db" != "$POSTGRES_DB" ] && [ "$db" != "$3" ]; then
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$db\"" -c "CREATE DATABASE \"$db\" $owner_clause"
  fi
  pg_restore -U "$POSTGRES_USER" -d "$db" --clean --if-exists $2 $role_option --exit-on-error
' sh "$RESTORE_DB" "$OWNER_OPTION" "$PRODUCTION_DB" "$OWNER_ROLE" < "$file"
echo "Restored from $file"
