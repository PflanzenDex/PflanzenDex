#!/usr/bin/env bash
# Wiederherstellungstest (NFR-15, TE-03): wegwerfbarer Postgres-Container, Testdaten, Sicherung, Einspielen in
# eine zweite Datenbank, Vergleich von Zeilenzahl und Prüfsumme. Berührt nie die Betriebsdatenbank.
# Voraussetzung: Docker. Aufruf: make restore-test
set -euo pipefail
cd "$(dirname "$0")/.."

name="pdx-restore-test-$$"
workdir="$(mktemp -d)"
cleanup() { docker rm -f "$name" > /dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT

export POSTGRES_USER=pdxtest POSTGRES_DB=pdxquelle
docker run -d --name "$name" -e POSTGRES_USER -e POSTGRES_DB \
  -e POSTGRES_PASSWORD="$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  postgres:16-alpine > /dev/null

for _ in $(seq 1 60); do
  # pg_isready meldet schon beim Init-Server "bereit"; erst die echte Abfrage nach dem Neustart zählt.
  if docker exec "$name" psql -U pdxtest -d pdxquelle -tAc 'select 1' > /dev/null 2>&1; then break; fi
  sleep 1
done

export PG_EXEC="docker exec -i $name"
psql_q() { docker exec "$name" psql -U pdxtest -d "$1" -v ON_ERROR_STOP=1 -tAc "$2"; }

psql_q pdxquelle "create table exemplar (id serial primary key, name text not null, notiz text)"
psql_q pdxquelle "insert into exemplar (name, notiz) select 'Pflanze ' || g, repeat('ä', g) from generate_series(1, 500) g"
soll="$(psql_q pdxquelle "select count(*) || ':' || md5(string_agg(name || coalesce(notiz,''), ',' order by id)) from exemplar")"

export BACKUP_DIR="$workdir/backups" BACKUP_REMOTE=""
./scripts/backup.sh
dump="$(ls "$BACKUP_DIR"/pflanzendex-*.dump)"
./scripts/restore.sh "$dump" pdxwiederhergestellt

ist="$(psql_q pdxwiederhergestellt "select count(*) || ':' || md5(string_agg(name || coalesce(notiz,''), ',' order by id)) from exemplar")"
if [ "$soll" != "$ist" ]; then
  echo "FEHLER: Wiederherstellung weicht ab (soll $soll, ist $ist)" >&2
  exit 1
fi
echo "OK: Wiederherstellungstest bestanden ($soll)"
