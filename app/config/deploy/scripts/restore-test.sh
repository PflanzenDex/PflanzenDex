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

export POSTGRES_USER=pdxtest POSTGRES_DB=pdx_source KEYCLOAK_DB_NAME=pdx_keycloak
docker run -d --name "$name" -e POSTGRES_USER -e POSTGRES_DB \
  -e POSTGRES_PASSWORD="$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  postgres:18-alpine > /dev/null

for _ in $(seq 1 60); do
  # pg_isready already reports "ready" for the init server; only a real query after the restart counts.
  if docker exec "$name" psql -U pdxtest -d pdx_source -tAc 'select 1' > /dev/null 2>&1; then break; fi
  sleep 1
done

# The sign-in service's database (TE-03) travels in the same backup run.
docker exec "$name" psql -U pdxtest -d postgres -v ON_ERROR_STOP=1 -c "create database $KEYCLOAK_DB_NAME" > /dev/null

# The schema owner role of the deployment (#907): the app dump is restored as this role, not as the cluster user.
docker exec "$name" psql -U pdxtest -d postgres -v ON_ERROR_STOP=1 -c "create role pdxowner login" > /dev/null
export DB_OWNER_USER=pdxowner

export PG_EXEC="docker exec -i $name"
psql_q() { docker exec "$name" psql -U pdxtest -d "$1" -v ON_ERROR_STOP=1 -tAc "$2"; }

psql_q pdx_source "create table specimen (id serial primary key, name text not null, note text)"
psql_q pdx_source "insert into specimen (name, note) select 'Plant ' || g, repeat('ä', g) from generate_series(1, 500) g"
expected="$(psql_q pdx_source "select count(*) || ':' || md5(string_agg(name || coalesce(note,''), ',' order by id)) from specimen")"

psql_q "$KEYCLOAK_DB_NAME" "create table user_entity (id serial primary key, username text not null)"
psql_q "$KEYCLOAK_DB_NAME" "insert into user_entity (username) select 'user' || g from generate_series(1, 50) g"
expected_kc="$(psql_q "$KEYCLOAK_DB_NAME" "select count(*) || ':' || md5(string_agg(username, ',' order by id)) from user_entity")"

export BACKUP_DIR="$workdir/backups" BACKUP_REMOTE=""
./scripts/backup.sh
dump="$(ls "$BACKUP_DIR"/pflanzendex-*.dump)"
./scripts/restore.sh "$dump" pdx_restored

owner="$(psql_q pdx_restored "select tableowner from pg_tables where tablename = 'specimen'")"
if [ "$owner" != "pdxowner" ]; then
  echo "ERROR: restored tables belong to $owner, not to the schema owner role (DB_OWNER_USER)" >&2
  exit 1
fi
actual="$(psql_q pdx_restored "select count(*) || ':' || md5(string_agg(name || coalesce(note,''), ',' order by id)) from specimen")"
if [ "$expected" != "$actual" ]; then
  echo "ERROR: restore differs (expected $expected, actual $actual)" >&2
  exit 1
fi

kc_dump="$(ls "$BACKUP_DIR"/keycloak-*.dump)"
./scripts/restore.sh "$kc_dump" pdx_keycloak_restored
actual_kc="$(psql_q pdx_keycloak_restored "select count(*) || ':' || md5(string_agg(username, ',' order by id)) from user_entity")"
if [ "$expected_kc" != "$actual_kc" ]; then
  echo "ERROR: sign-in database restore differs (expected $expected_kc, actual $actual_kc)" >&2
  exit 1
fi
echo "OK: restore test passed ($expected, sign-in database $expected_kc)"
