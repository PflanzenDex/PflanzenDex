#!/usr/bin/env bash
# Tester account of the deploy smoke test (US-DEV-06, #1404). Creates, idempotently, the user that scripts/smoke.sh signs
# in with in the realm `pflanzendex` (verified email, enabled, no required actions), and the app's account row for its
# subject, so the first smoke sign-in also works while registration is invitation-only (US-ACC-05). Run on the host:
#   app/config/deploy/keycloak/smoke-user.sh [--rotate-password]
# An existing user is left alone and its password is not shown. --rotate-password sets a new password. When a user is
# created or rotated, the script prints the two lines SMOKE_USER and SMOKE_PASSWORD for app/config/deploy/.env: that
# output is the only copy of the password. The password reaches the container on stdin, never on a command line.
# Env: SMOKE_USER (default: the value in .env, else smoke-tester); KC_EXEC and DB_EXEC override how the keycloak and the
# db containers are reached (tests), as in master-realm.sh. Exit 0 = done, 1 = failed, 2 = usage error.
set -uo pipefail
cd "$(dirname "$0")/.."

case "$*" in
  "") rotate="" ;;
  --rotate-password) rotate=1 ;;
  *) echo "usage: smoke-user.sh [--rotate-password]" >&2; exit 2 ;;
esac

KC_EXEC="${KC_EXEC:-docker compose --env-file .env exec -T keycloak}"
DB_EXEC="${DB_EXEC:-docker compose --env-file .env exec -T db}"
tester="${SMOKE_USER:-}"
if [ -z "$tester" ] && [ -f .env ]; then tester="$(sed -n 's/^SMOKE_USER=//p' .env | head -n 1)"; fi
tester="${tester:-smoke-tester}"
case "$tester" in
  *[!a-z0-9._-]*) echo "smoke-user: SMOKE_USER may hold only lower case letters, digits, dots, dashes and underscores" >&2; exit 2 ;;
esac
# A placeholder address (RFC 2606 reserved domain): the account is verified here, so no mail is ever sent to it.
email="$tester@example.com"
password="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
mode=ensure
if [ -n "$rotate" ]; then mode=rotate; fi

# Runs in the keycloak container. Reads username, email, mode and password from stdin, one per line, so the password is
# on no command line. Prints `STATE created|rotated|exists` and `ID <uuid>`, or `ERROR <reason>` and exits 1.
inside='
IFS= read -r username && IFS= read -r email && IFS= read -r mode && IFS= read -r password || { echo "ERROR input"; exit 1; }
kcadm=/opt/keycloak/bin/kcadm.sh
cfg=/tmp/kcadm-smoke-user.config
trap "rm -f $cfg" EXIT
uuid="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
$kcadm config credentials --config "$cfg" --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" > /dev/null 2>&1 || { echo "ERROR login"; exit 1; }
id="$($kcadm get users --config "$cfg" -r pflanzendex -q username="$username" -q exact=true --fields id 2> /dev/null | grep -Eo "$uuid" | head -n 1)"
state=exists
if [ -z "$id" ]; then
  id="$($kcadm create users --config "$cfg" -r pflanzendex -s username="$username" -s email="$email" -s emailVerified=true -s enabled=true -s firstName=Smoke -s lastName=Tester -i 2> /dev/null | grep -Eo "$uuid" | head -n 1)"
  [ -n "$id" ] || { echo "ERROR create"; exit 1; }
  state=created
fi
if [ "$state" = created ] || [ "$mode" = rotate ]; then
  $kcadm set-password --config "$cfg" -r pflanzendex --username "$username" --new-password "$password" > /dev/null 2>&1 || { echo "ERROR password"; exit 1; }
  if [ "$state" = exists ]; then state=rotated; fi
fi
echo "STATE $state"
echo "ID $id"
'

if ! out="$(printf '%s\n' "$tester" "$email" "$mode" "$password" | $KC_EXEC sh -c "$inside")"; then
  echo "smoke-user: FAILED (${out:-no answer from the keycloak container}). Check in this order: the keycloak container runs; a first start may still be importing the realm (every realm URL answers 503 until the import has ended, about 20 s after keycloak is healthy: wait a minute and run again); the bootstrap admin still signs in (after the admin handover, create the user by hand: runbook release-and-rollback.md, \"Smoke test\")." >&2
  exit 1
fi
state="$(printf '%s\n' "$out" | sed -n 's/^STATE //p')"
id="$(printf '%s\n' "$out" | sed -n 's/^ID //p')"
if ! printf '%s' "$id" | grep -Eq '^[0-9a-fA-F-]{36}$' || [ -z "$state" ]; then
  echo "smoke-user: FAILED: unexpected answer from the keycloak container" >&2
  exit 1
fi

if [ "$state" != exists ]; then
  echo "smoke-user: $state $tester in realm pflanzendex (verified email, enabled, no required actions), subject $id"
  echo "Add or replace these two lines in app/config/deploy/.env (the password is shown only now):"
  echo "SMOKE_USER=$tester"
  echo "SMOKE_PASSWORD=$password"
fi

# The app account for the subject: the row that the first sign-in creates (US-ACC-01). A no-op when it exists already.
sql="insert into account (subject) values (:'sub') on conflict (subject) do nothing;"
if ! printf '%s\n' "$sql" | $DB_EXEC sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1 -v sub=$id -f - > /dev/null"; then
  echo "smoke-user: FAILED: the app account for subject $id could not be written; run the script again (the Keycloak user is kept)" >&2
  exit 1
fi
if [ "$state" = exists ]; then
  echo "smoke-user: $tester exists (subject $id): nothing changed in Keycloak, its password is not shown. --rotate-password sets a new one and prints it."
fi
echo "smoke-user: the app account for subject $id is in place."
