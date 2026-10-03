#!/usr/bin/env bash
# Restore test (NFR-15, TE-03): throwaway Postgres container, test data, backup, restore into a second
# database, then compare row count and checksum. Never touches the production database.
# Requires Docker. Usage: make restore-test
set -euo pipefail
cd "$(dirname "$0")/.."

name="pdx-restore-test-$$"
workdir="$(mktemp -d)"
cleanup() { docker rm -f "$name" > /dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT

export POSTGRES_USER=pdxtest POSTGRES_DB=pdx_source
docker run -d --name "$name" -e POSTGRES_USER -e POSTGRES_DB \
  -e POSTGRES_PASSWORD="$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  postgres:16-alpine > /dev/null

for _ in $(seq 1 60); do
  # pg_isready already reports "ready" for the init server; only a real query after the restart counts.
  if docker exec "$name" psql -U pdxtest -d pdx_source -tAc 'select 1' > /dev/null 2>&1; then break; fi
  sleep 1
done

export PG_EXEC="docker exec -i $name"
psql_q() { docker exec "$name" psql -U pdxtest -d "$1" -v ON_ERROR_STOP=1 -tAc "$2"; }

psql_q pdx_source "create table exemplar (id serial primary key, name text not null, notiz text)"
psql_q pdx_source "insert into exemplar (name, notiz) select 'Pflanze ' || g, repeat('ä', g) from generate_series(1, 500) g"
expected="$(psql_q pdx_source "select count(*) || ':' || md5(string_agg(name || coalesce(notiz,''), ',' order by id)) from exemplar")"

export BACKUP_DIR="$workdir/backups" BACKUP_REMOTE=""
./scripts/backup.sh
dump="$(ls "$BACKUP_DIR"/pflanzendex-*.dump)"
./scripts/restore.sh "$dump" pdx_restored

actual="$(psql_q pdx_restored "select count(*) || ':' || md5(string_agg(name || coalesce(notiz,''), ',' order by id)) from exemplar")"
if [ "$expected" != "$actual" ]; then
  echo "ERROR: restore differs (expected $expected, actual $actual)" >&2
  exit 1
fi
echo "OK: restore test passed ($expected)"
