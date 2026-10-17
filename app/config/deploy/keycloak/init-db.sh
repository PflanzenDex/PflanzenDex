#!/bin/sh
# One-shot (service `keycloak-db`): creates the role and the database of the sign-in service in the app's PostgreSQL
# server, idempotently. Runs as the cluster user; the password of the role follows KC_DB_PASSWORD on every run, so
# rotating it in .env and running `up` is enough. The role owns only its own database: the app database is closed
# to everyone but the cluster user (CONNECT revoked from PUBLIC), so the sign-in service cannot touch tenant data (P-04).
# Environment: PGHOST, PGUSER, PGPASSWORD (cluster user), APP_DB, KC_DB_NAME, KC_DB_USER, KC_DB_PASSWORD.
set -eu

psql -d postgres -v ON_ERROR_STOP=1 \
  -v kcuser="$KC_DB_USER" -v kcpass="$KC_DB_PASSWORD" -v kcdb="$KC_DB_NAME" \
  -v appdb="$APP_DB" -v admin="$PGUSER" <<'SQL'
select format('create role %I login', :'kcuser')
 where not exists (select from pg_roles where rolname = :'kcuser') \gexec
select format('alter role %I with login nosuperuser nocreatedb nocreaterole noinherit password %L', :'kcuser', :'kcpass') \gexec
select format('create database %I owner %I', :'kcdb', :'kcuser')
 where not exists (select from pg_database where datname = :'kcdb') \gexec
select format('revoke connect on database %I from public', :'kcdb') \gexec
select format('grant connect on database %I to %I', :'kcdb', :'kcuser') \gexec
select format('grant connect on database %I to %I', :'kcdb', :'admin') \gexec
select format('revoke connect on database %I from public', :'appdb') \gexec
select format('grant connect on database %I to %I', :'appdb', :'admin') \gexec
SQL
echo "keycloak-db: role $KC_DB_USER and database $KC_DB_NAME are ready"
