#!/usr/bin/env bash
# Staging deploy from main (TE-03): fetches origin/main, builds the images, restarts, waits for /health.
# Usage on the host, in the checkout:  make deploy     (or deploy/scripts/deploy.sh [ref], default origin/main)
set -euo pipefail
cd "$(dirname "$0")/.."

ref="${1:-origin/main}"
if [ ! -f .env ]; then echo "ERROR: deploy/.env is missing (template: .env.example)" >&2; exit 1; fi

git fetch --quiet origin
git checkout --quiet --detach "$ref"
GIT_SHA="$(git rev-parse --short HEAD)"
export GIT_SHA

compose=(docker compose --env-file .env -f docker-compose.yml)
# Before a migration a backup would come first (US-DEV-07); without migrations only if the DB is running.
if "${compose[@]}" ps --status running --services 2> /dev/null | grep -qx db; then ./scripts/backup.sh; fi

"${compose[@]}" up -d --build --remove-orphans

for _ in $(seq 1 30); do
  if [ "$("${compose[@]}" ps --format '{{.Service}} {{.Health}}' | grep -c '^api healthy')" = 1 ]; then
    echo "Deploy ok: $GIT_SHA ($ref)"; exit 0
  fi
  sleep 2
done
echo "ERROR: api did not become healthy; logs: ${compose[*]} logs api" >&2
exit 1
