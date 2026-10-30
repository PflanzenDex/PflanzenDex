#!/usr/bin/env bash
# Database backup (NFR-15, TE-03): pg_dump in custom format, verified with pg_restore -l. Two files per run:
# pflanzendex-<time>.dump (app) and keycloak-<time>.dump (sign-in service, only if its database exists).
# Retention per BACKUP_RETENTION_DAYS; optional second target via rsync (BACKUP_REMOTE, R-11).
# Environment: DEPLOY_ENV_FILE names the env file (default config/deploy/.env if present, empty or missing = none; its COMPOSE_FILE selects the overlay files); PG_EXEC overrides how the Postgres container is reached (for tests).
# The dumps hold password hashes and realm keys: only the owner may read them (0600 in a 0700 folder), and the
# default folder lies outside the repository, so a `git add -A` on the host cannot pick them up (#760).
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

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
BACKUP_DIR="${BACKUP_DIR:-$HOME/pflanzendex-backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"

KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
# Dumps of earlier runs were written with the default umask (0664); tighten them on the next run.
find "$BACKUP_DIR" -maxdepth 1 \( -name 'pflanzendex-*.dump' -o -name 'keycloak-*.dump' \) -exec chmod 600 {} +
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial=""
trap '[ -z "$partial" ] || rm -f "$partial"' EXIT

# Dumps one database into $BACKUP_DIR/<prefix>-<stamp>.dump and checks that it is readable.
# The dump is created inside the container; user and default database come from its environment.
dump_database() {
  local prefix="$1" database="${2:-}"
  local target="$BACKUP_DIR/$prefix-$stamp.dump"
  partial="$target.partial"
  $PG_EXEC sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "${1:-$POSTGRES_DB}"' sh "$database" > "$partial"
  if [ ! -s "$partial" ]; then echo "ERROR: backup of ${database:-the app database} is empty" >&2; exit 1; fi
  if ! $PG_EXEC pg_restore -l < "$partial" > /dev/null; then
    echo "ERROR: backup of ${database:-the app database} is not readable (pg_restore -l)" >&2; exit 1
  fi
  mv "$partial" "$target"
  partial=""
  echo "Backup written: $target"
}

# True if the sign-in service's database exists (TE-03); older stacks without Keycloak have none.
keycloak_database_exists() {
  local found
  found="$(echo "select 1 from pg_database where datname = :'db'" |
    $PG_EXEC sh -c 'psql -U "$POSTGRES_USER" -d postgres -tA -v db="$1"' sh "$KEYCLOAK_DB_NAME")"
  [ "$found" = 1 ]
}

dump_database pflanzendex
# The sign-in service's accounts and sessions are part of the data: without them nobody could sign in after a restore.
if keycloak_database_exists; then dump_database keycloak "$KEYCLOAK_DB_NAME"; fi

find "$BACKUP_DIR" \( -name 'pflanzendex-*.dump' -o -name 'keycloak-*.dump' \) -mtime +"$RETENTION" -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a --ignore-existing "$BACKUP_DIR"/ "$BACKUP_REMOTE"/
  echo "Second target updated: $BACKUP_REMOTE"
fi
