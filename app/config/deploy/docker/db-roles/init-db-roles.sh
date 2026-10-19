#!/bin/sh
# One-shot (service `db-roles`): makes the schema owner of the app database a plain role, idempotently (#907, P-04).
# Runs as the cluster user (a superuser) BEFORE `migrate`; also on an existing volume. Why: a `security definer`
# function runs with the owner's rights, and a superuser (or BYPASSRLS) owner is never bound by row-level security, so
# every function that trusted the row rule saw all accounts. Roles afterwards:
#   cluster user (POSTGRES_USER)  superuser, only for administration (backup, restore, these one-shots), no app connection
#   DB_OWNER_USER                 owns the schema, runs migrations and the api; NOSUPERUSER NOBYPASSRLS NOCREATEROLE
#   pflanzendex_app               NOLOGIN; the api switches to it per transaction (`set local role`), row rules apply
# An existing database owned by the cluster user is converted in place (transfer-ownership.sql, then migration 0094
# moves the policies that name the old owner). Environment: PGHOST, PGUSER, PGPASSWORD (cluster user), APP_DB,
# DB_OWNER_USER, DB_OWNER_PASSWORD. The password follows DB_OWNER_PASSWORD on every run (rotate in .env, run `up`).
set -eu

if [ "$DB_OWNER_USER" = "$PGUSER" ]; then
  echo "db-roles: DB_OWNER_USER must differ from POSTGRES_USER ($PGUSER is a superuser)" >&2
  exit 1
fi

psql -d postgres -v ON_ERROR_STOP=1 \
  -v owner="$DB_OWNER_USER" -v ownerpass="$DB_OWNER_PASSWORD" -v appdb="$APP_DB" -v admin="$PGUSER" <<'SQL'
select 'create role pflanzendex_app nologin'
 where not exists (select from pg_roles where rolname = 'pflanzendex_app') \gexec
alter role pflanzendex_app with nologin nosuperuser nocreatedb nocreaterole nobypassrls;
select format('create role %I login', :'owner')
 where not exists (select from pg_roles where rolname = :'owner') \gexec
select format('alter role %I with login nosuperuser nocreatedb nocreaterole nobypassrls noreplication password %L',
              :'owner', :'ownerpass') \gexec
-- Migration 0001 runs `grant pflanzendex_app to current_user`, which needs the admin option on the role.
select format('grant pflanzendex_app to %I with admin option', :'owner') \gexec
select format('alter database %I owner to %I', :'appdb', :'owner') \gexec
select format('revoke connect on database %I from public', :'appdb') \gexec
select format('grant connect on database %I to %I', :'appdb', :'owner') \gexec
select format('grant connect on database %I to %I', :'appdb', :'admin') \gexec
SQL

# Objects of an existing database created by the cluster user move to the owner (nothing to do on a fresh one).
{
  echo "select set_config('pflanzendex.new_owner', :'owner', false);"
  cat /db-roles/transfer-ownership.sql
} | psql -d "$APP_DB" -v ON_ERROR_STOP=1 -v owner="$DB_OWNER_USER"

echo "db-roles: owner $DB_OWNER_USER (no superuser, no BYPASSRLS) owns $APP_DB; application role pflanzendex_app is ready"
