#!/usr/bin/env bash
# Staging deploy (TE-03, US-DEV-06): fetches origin/main, builds images, restarts, waits for health,
# runs the smoke test and rolls back to the previous ref automatically if it fails.
# Usage on the host, in the checkout:  make deploy   (or deploy/scripts/deploy.sh [ref], default origin/main)
# Deploying stays a deliberate step (E-14); nothing in CI calls this script.
set -euo pipefail
cd "$(dirname "$0")/.."

compose=(docker compose --env-file .env -f docker-compose.yml)

# Builds and starts <ref>, waits for api health, then smoke-tests it. Returns non-zero on any failure.
deploy_ref() {
  local ref="$1"
  git checkout --quiet --detach "$ref"
  GIT_SHA="$(git rev-parse --short HEAD)"
  APP_VERSION="$(git describe --tags --always)"
  export GIT_SHA APP_VERSION
  # The one-shot `migrate` service runs before the api (docker-compose.yml); a failed migration fails this step.
  "${compose[@]}" up -d --build --remove-orphans || { echo "compose up failed (build or migration); logs: ${compose[*]} logs migrate" >&2; return 1; }
  local healthy=0
  for _ in $(seq 1 30); do
    if [ "$("${compose[@]}" ps --format '{{.Service}} {{.Health}}' | grep -c '^api healthy')" = 1 ]; then healthy=1; break; fi
    sleep 2
  done
  if [ "$healthy" != 1 ]; then echo "api did not become healthy; logs: ${compose[*]} logs api" >&2; return 1; fi
  ./scripts/smoke.sh "$(smoke_base_url)" "$APP_VERSION"
}

# Smoke target: SMOKE_URL, else the proxy address from .env (local Caddy CA needs -k for localhost).
smoke_base_url() {
  if [ -n "${SMOKE_URL:-}" ]; then echo "$SMOKE_URL"; return; fi
  set -a; . ./.env; set +a
  local port=""
  if [ "${HTTPS_PORT:-443}" != 443 ]; then port=":${HTTPS_PORT}"; fi
  if [ "$SITE_ADDRESS" = localhost ]; then export SMOKE_CURL_OPTS="${SMOKE_CURL_OPTS:--k}"; fi
  echo "https://${SITE_ADDRESS}${port}"
}

main() {
  local ref="${1:-origin/main}"
  if [ ! -f .env ]; then echo "ERROR: deploy/.env is missing (template: .env.example)" >&2; exit 1; fi

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
