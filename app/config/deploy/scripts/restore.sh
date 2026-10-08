#!/usr/bin/env bash
# Restore (NFR-15, TE-03): loads a backup into a database.
# Usage: restore.sh <backup.dump> [target-database]
# Without a target database the production database (POSTGRES_DB) is overwritten; that requires CONFIRM=yes.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:-}"
if [ -z "$file" ] || [ ! -s "$file" ]; then echo "usage: restore.sh <backup.dump> [target-database]" >&2; exit 2; fi

if [ -f .env ]; then set -a; . ./.env; set +a; fi
PG_EXEC="${PG_EXEC:-docker compose --env-file .env -f docker-compose.yml exec -T db}"
RESTORE_DB="${2:-}"

if [ -z "$RESTORE_DB" ]; then
  if [ "${CONFIRM:-}" != "yes" ]; then
    echo "This overwrites the production database. Confirm with CONFIRM=yes or pass a target database." >&2
    exit 2
  fi
fi

# Create the target database if it differs from the production database, then restore into it.
$PG_EXEC sh -c '
  set -e
  db="${1:-$POSTGRES_DB}"
  if [ "$db" != "$POSTGRES_DB" ]; then
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$db\"" -c "CREATE DATABASE \"$db\""
  fi
  pg_restore -U "$POSTGRES_USER" -d "$db" --clean --if-exists --no-owner --exit-on-error
' sh "$RESTORE_DB" < "$file"
echo "Restored from $file"
