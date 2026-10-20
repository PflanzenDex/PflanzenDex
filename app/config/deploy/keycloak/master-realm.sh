#!/usr/bin/env bash
# Master realm hardening (TE-03, #758): turns on brute-force protection in Keycloak's master realm, idempotently.
# The master realm is blocked on the public name, but every container on the stack network reaches Keycloak directly.
# deploy.sh calls this after Keycloak is healthy. It signs in as the bootstrap admin with the credentials the keycloak
# container already has (KC_BOOTSTRAP_ADMIN_*), so no password passes through the host's shell. After the handover to
# a named admin (runbook "Master realm and admin handover") the bootstrap admin is gone: the script then says so and
# leaves the setting to that admin. Exit 0 = protected or handed over, 1 = the change failed.
# Env: KC_EXEC overrides how the keycloak container is reached (for tests).
set -uo pipefail
cd "$(dirname "$0")/.."

KC_EXEC="${KC_EXEC:-docker compose --env-file .env exec -T keycloak}"
# Failed sign-ins before a temporary lockout, the same as the app realm (starting value, assumption).
FAILURE_FACTOR=5

# The kcadm session lives in a throwaway config file inside the container, not in the admin's home folder.
kcadm='/opt/keycloak/bin/kcadm.sh'
config='--config /tmp/kcadm-master-realm.config'
login="$kcadm config credentials $config --server http://localhost:8080 --realm master"
login="$login --user \"\$KC_BOOTSTRAP_ADMIN_USERNAME\" --password \"\$KC_BOOTSTRAP_ADMIN_PASSWORD\""

if ! $KC_EXEC sh -c "$login" > /dev/null 2>&1; then
  echo "master realm: the bootstrap admin cannot sign in (handed over to a named admin?); brute-force protection stays with that admin (runbook)"
  exit 0
fi
if ! $KC_EXEC sh -c "$kcadm update realms/master $config -s bruteForceProtected=true -s failureFactor=$FAILURE_FACTOR"; then
  echo "ERROR: could not turn on brute-force protection in the master realm" >&2
  exit 1
fi
$KC_EXEC sh -c "rm -f /tmp/kcadm-master-realm.config" || true
echo "master realm: brute-force protection on (failureFactor $FAILURE_FACTOR)"
