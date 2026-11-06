#!/usr/bin/env bash
# Master realm hardening (TE-03, #758): turns on brute-force protection in Keycloak's master realm, idempotently.
# The master realm is blocked on the public name, but every container on the stack network reaches Keycloak directly.
# deploy.sh calls this after Keycloak is healthy. It signs in as the bootstrap admin with the credentials the keycloak
# container already has (KC_BOOTSTRAP_ADMIN_*), so no password passes through the host's shell.
# The handover to a named admin (runbook "Master realm and admin handover") deletes the bootstrap admin. Keycloak then
# rejects its sign-in with `Invalid user credentials [invalid_grant]` (Keycloak 26.8.1, measured for #1461): only that
# rejection is taken as the handover. The script says so and leaves the setting to that admin (exit 0). Every other
# failure of the sign-in exits 1 and names the cause, because the setting was not checked: a stopped container
# (`service "keycloak" is not running`), no listener yet (`Connection refused`), the realm still importing (`503`).
# kcadm gives the same rejection for a mistyped or rotated bootstrap password and for a brute-force lockout of the
# admin, so those count as the handover too: check the setting by hand (runbook, step 4) when in doubt.
# Exit 0 = protected or handed over, 1 = the change failed or the sign-in failed for another reason.
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

login_out="$($KC_EXEC sh -c "$login" 2>&1)"
login_rc=$?
if [ "$login_rc" -ne 0 ]; then
  # Only the rejection of the credentials is the handover; any other failure is reported, not skipped (P-10, #1461).
  if grep -q -F '[invalid_grant]' <<< "$login_out"; then
    echo "master realm: the bootstrap admin cannot sign in (handed over to a named admin?); brute-force protection stays with that admin (runbook)"
    exit 0
  fi
  # The last line of kcadm's or docker's output names the cause; kcadm's first line ("Logging into ...") is skipped.
  cause="$(printf '%s\n' "$login_out" | sed -n '/^Logging into /!{/[^[:space:]]/p}' | tail -n 1)"
  echo "ERROR: master realm: the sign-in as the bootstrap admin failed: ${cause:-no answer from the keycloak container}. Brute-force protection is NOT set in the master realm. Keycloak must run and answer; then run the deploy again (runbook: staging-deploy-and-backup.md, \"Master realm and admin handover\")." >&2
  exit 1
fi
if ! $KC_EXEC sh -c "$kcadm update realms/master $config -s bruteForceProtected=true -s failureFactor=$FAILURE_FACTOR"; then
  echo "ERROR: could not turn on brute-force protection in the master realm" >&2
  exit 1
fi
$KC_EXEC sh -c "rm -f /tmp/kcadm-master-realm.config" || true
echo "master realm: brute-force protection on (failureFactor $FAILURE_FACTOR)"
