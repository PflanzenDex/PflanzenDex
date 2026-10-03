#!/usr/bin/env bash
# Database backup (NFR-15, TE-03): pg_dump in custom format, verified with pg_restore -l.
# Retention per BACKUP_RETENTION_DAYS; optional second target via rsync (BACKUP_REMOTE, R-11).
# Environment: deploy/.env (if present); PG_EXEC overrides how the Postgres container is reached (for tests).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi
PG_EXEC="${PG_EXEC:-docker compose --env-file .env -f docker-compose.yml exec -T db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/pflanzendex-$stamp.dump"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

# The dump is created inside the container; user and database come from its environment.
$PG_EXEC sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$partial"

if [ ! -s "$partial" ]; then echo "ERROR: backup is empty" >&2; exit 1; fi
if ! $PG_EXEC pg_restore -l < "$partial" > /dev/null; then
  echo "ERROR: backup is not readable (pg_restore -l)" >&2; exit 1
fi
mv "$partial" "$target"
trap - EXIT
echo "Backup written: $target"

find "$BACKUP_DIR" -name 'pflanzendex-*.dump' -mtime +"$RETENTION" -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a --ignore-existing "$BACKUP_DIR"/ "$BACKUP_REMOTE"/
  echo "Second target updated: $BACKUP_REMOTE"
fi
