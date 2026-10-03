#!/usr/bin/env bash
# Sicherung der Datenbank (NFR-15, TE-03): pg_dump im Custom-Format, geprüft mit pg_restore -l.
# Aufbewahrung nach BACKUP_RETENTION_DAYS; optionales zweites Ziel per rsync (BACKUP_REMOTE, R-11).
# Umgebung: deploy/.env (falls vorhanden); PG_EXEC überschreibt den Weg zum Postgres-Container (für Tests).
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

# Der Dump entsteht im Container; Benutzer und Datenbank stammen aus dessen Umgebung.
$PG_EXEC sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$partial"

if [ ! -s "$partial" ]; then echo "FEHLER: Sicherung ist leer" >&2; exit 1; fi
if ! $PG_EXEC pg_restore -l < "$partial" > /dev/null; then
  echo "FEHLER: Sicherung ist nicht lesbar (pg_restore -l)" >&2; exit 1
fi
mv "$partial" "$target"
trap - EXIT
echo "Sicherung geschrieben: $target"

find "$BACKUP_DIR" -name 'pflanzendex-*.dump' -mtime +"$RETENTION" -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a --ignore-existing "$BACKUP_DIR"/ "$BACKUP_REMOTE"/
  echo "Zweites Ziel aktualisiert: $BACKUP_REMOTE"
fi
