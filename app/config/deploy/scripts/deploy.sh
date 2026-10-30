#!/usr/bin/env bash
# Staging deploy (TE-03, US-DEV-06): fetches origin/main, builds images, restarts, waits for health,
# runs the smoke test and rolls back to the previous ref automatically if it fails.
# Usage on the host, in the checkout:  make deploy   (or config/deploy/scripts/deploy.sh [ref], default origin/main)
# Every deploy is a deliberate, manual step (E-14). From GitHub: the workflow .github/workflows/deploy.yml (TE-19),
# started by hand with an environment (test or prod) and a ref, calls this script over Tailscale SSH with the full SHA.
# The workflow's guard allows prod only for a stable release tag on `main`; this script itself does not check that.
set -euo pipefail
cd "$(dirname "$0")/.."

# The compose files come from COMPOSE_FILE in .env (default: docker-compose.yml; the test environment adds docker-compose.test.yml).
compose=(docker compose --env-file .env)

# Waits until a service reports healthy (every 2 seconds, at most <tries> times).
wait_healthy() {
  local service="$1" tries="$2"
  for _ in $(seq 1 "$tries"); do
    if [ "$("${compose[@]}" ps --format '{{.Service}} {{.Health}}' | grep -c "^$service healthy")" = 1 ]; then return 0; fi
    sleep 2
  done
  echo "$service did not become healthy; logs: ${compose[*]} logs $service" >&2
  return 1
}

# Refuses to start a PostgreSQL image on a data volume of another major or layout (US-DEV-07, P-10). The official image
# only refuses the old layout (PG_VERSION at the volume root); a 16 image on an 18 volume would start an empty cluster in
# its own data folder and nothing would fail. Layout: up to 16 the data sits at the volume root, from 18 on in <major>/docker.
# Runs for every `up`, also for a rollback, because it reads the image of the checked-out compose file.
check_db_volume() {
  local volume="${COMPOSE_PROJECT_NAME:-pflanzendex}_dbdata" major layout state
  # A new host has no volume yet: nothing to protect.
  docker volume inspect "$volume" > /dev/null 2>&1 || return 0
  # The image is pinned as postgres:<major>.<minor>-alpine<x>@sha256:… (#761); the major ends at the first `.` or `-`.
  major="$("${compose[@]}" config --images | sed -n 's/^postgres:\([0-9]*\)[.-].*/\1/p' | head -n 1)"
  if [ -z "$major" ]; then echo "ERROR: no postgres image in the compose file" >&2; return 1; fi
  state="$(docker run --rm -v "$volume:/v:ro" alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a sh -c '
    if [ -f /v/PG_VERSION ]; then echo "old $(cat /v/PG_VERSION)"
    elif ls /v/*/docker/PG_VERSION > /dev/null 2>&1; then echo "new $(cat /v/*/docker/PG_VERSION)"
    else echo empty; fi')" || { echo "ERROR: cannot read the database volume $volume" >&2; return 1; }
  layout=old
  if [ "$major" -ge 18 ]; then layout=new; fi
  if [ "$state" = empty ] || [ "$state" = "$layout $major" ]; then return 0; fi
  echo "ERROR: the database volume $volume holds $state data, but this deploy starts postgres:$major ($layout layout). Nothing was started; upgrade or roll back as described in docs/guides/operations/postgres-major-upgrade.md." >&2
  return 1
}

# Builds and starts <ref>, waits for api health, then smoke-tests it. Returns non-zero on any failure.
deploy_ref() {
  local ref="$1"
  git checkout --quiet --detach "$ref"
  GIT_SHA="$(git rev-parse --short HEAD)"
  APP_VERSION="$(git describe --tags --always)"
  export GIT_SHA APP_VERSION
  check_db_volume || return 1
  # The one-shot `migrate` service runs before the api (docker-compose.yml); a failed migration fails this step.
  "${compose[@]}" up -d --build --remove-orphans || { echo "compose up failed (build or migration); logs: ${compose[*]} logs migrate" >&2; return 1; }
  wait_healthy api 30 || return 1
  # The sign-in service starts slowly on a small host (first start imports the realm), hence the longer wait.
  wait_healthy keycloak 90 || return 1
  # Brute-force protection in the master realm (#758); idempotent, a no-op after the admin handover.
  ./keycloak/master-realm.sh || return 1
  smoke_target
  # The version is only on /health/details, which the proxy does not serve publicly (#759): read it inside the api.
  SMOKE_DETAILS_CMD="${SMOKE_DETAILS_CMD:-${compose[*]} exec -T api wget -qO- http://127.0.0.1:3000/health/details}" \
    ./scripts/smoke.sh "$SMOKE_BASE" "$APP_VERSION"
}

# Smoke target: SMOKE_URL, else the proxy on this host. Behind a TLS-terminating proxy (CADDY_SCHEME=http://) the
# plain HTTP port answers with the right Host header; otherwise Caddy's HTTPS port (local CA needs -k for localhost).
# Sets SMOKE_BASE and exports SMOKE_CURL_OPTS in the current shell: called inside $(...) the export would be lost
# and smoke.sh would ask the proxy without the Host header.
smoke_target() {
  if [ -n "${SMOKE_URL:-}" ]; then SMOKE_BASE="$SMOKE_URL"; return; fi
  set -a; . ./.env; set +a
  if [ "${CADDY_SCHEME:-}" = "http://" ]; then
    export SMOKE_CURL_OPTS="${SMOKE_CURL_OPTS:--H Host:${APP_HOST}}"
    SMOKE_BASE="http://127.0.0.1:${HTTP_PORT:-80}"
    return
  fi
  local port=""
  if [ "${HTTPS_PORT:-443}" != 443 ]; then port=":${HTTPS_PORT}"; fi
  case "$APP_HOST" in localhost | *.localhost) export SMOKE_CURL_OPTS="${SMOKE_CURL_OPTS:--k --resolve ${APP_HOST}:${HTTPS_PORT:-443}:127.0.0.1}" ;; esac
  SMOKE_BASE="https://${APP_HOST}${port}"
}

main() {
  local ref="${1:-origin/main}"
  if [ ! -f .env ]; then echo "ERROR: config/deploy/.env is missing (template: .env.example)" >&2; exit 1; fi

  set -a; . ./.env; set +a
  git fetch --quiet --tags origin
  local previous
  previous="$(git rev-parse HEAD)"

  # Backup before the deploy (US-DEV-07), only if the database is already running.
  if "${compose[@]}" ps --status running --services 2> /dev/null | grep -qx db; then ./scripts/backup.sh; fi

  if deploy_ref "$ref"; then echo "Deploy ok: $APP_VERSION ($GIT_SHA, $ref)"; exit 0; fi

  echo "ERROR: deploy of $ref failed; rolling back to $previous" >&2
  if deploy_ref "$previous"; then
    echo "ROLLBACK ok: back to $APP_VERSION ($GIT_SHA). Deploy of $ref is NOT live. Database migrations are not rolled back (backup: scripts/restore.sh)." >&2
  else
    echo "ROLLBACK FAILED: manual intervention required (docs/guides/operations/release-and-rollback.md)." >&2
  fi
  exit 1
}

# The script file may change on checkout; bash has read the whole body above, and exits before reading on.
main "$@"
exit $?
