#!/usr/bin/env bash
# Wiederherstellung (NFR-15, TE-03): spielt eine Sicherung in eine Datenbank ein.
# Aufruf: restore.sh <sicherung.dump> [zieldatenbank]
# Ohne Zieldatenbank wird die Betriebsdatenbank (POSTGRES_DB) überschrieben; das verlangt CONFIRM=ja.
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:-}"
if [ -z "$file" ] || [ ! -s "$file" ]; then echo "Aufruf: restore.sh <sicherung.dump> [zieldatenbank]" >&2; exit 2; fi

if [ -f .env ]; then set -a; . ./.env; set +a; fi
PG_EXEC="${PG_EXEC:-docker compose --env-file .env -f docker-compose.yml exec -T db}"
RESTORE_DB="${2:-}"

if [ -z "$RESTORE_DB" ]; then
  if [ "${CONFIRM:-}" != "ja" ]; then
    echo "Das überschreibt die Betriebsdatenbank. Mit CONFIRM=ja bestätigen oder eine Zieldatenbank angeben." >&2
    exit 2
  fi
fi

# Zieldatenbank anlegen, falls es eine andere als die Betriebsdatenbank ist; dann einspielen.
$PG_EXEC sh -c '
  set -e
  db="${1:-$POSTGRES_DB}"
  if [ "$db" != "$POSTGRES_DB" ]; then
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$db\"" -c "CREATE DATABASE \"$db\""
  fi
  pg_restore -U "$POSTGRES_USER" -d "$db" --clean --if-exists --no-owner --exit-on-error
' sh "$RESTORE_DB" < "$file"
echo "Wiederhergestellt aus $file"
