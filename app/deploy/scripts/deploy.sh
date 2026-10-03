#!/usr/bin/env bash
# Staging-Deploy aus main (TE-03): holt origin/main, baut die Images, startet neu, wartet auf /health.
# Aufruf auf dem Host im Checkout:  make deploy     (oder deploy/scripts/deploy.sh [ref], Standard origin/main)
set -euo pipefail
cd "$(dirname "$0")/.."

ref="${1:-origin/main}"
if [ ! -f .env ]; then echo "FEHLER: deploy/.env fehlt (Vorlage: .env.example)" >&2; exit 1; fi

git fetch --quiet origin
git checkout --quiet --detach "$ref"
GIT_SHA="$(git rev-parse --short HEAD)"
export GIT_SHA

compose=(docker compose --env-file .env -f docker-compose.yml)
# Vor einer Migration gäbe es hier zuerst eine Sicherung (US-DEV-07); ohne Migrationen nur, wenn die DB läuft.
if "${compose[@]}" ps --status running --services 2> /dev/null | grep -qx db; then ./scripts/backup.sh; fi

"${compose[@]}" up -d --build --remove-orphans

for _ in $(seq 1 30); do
  if [ "$("${compose[@]}" ps --format '{{.Service}} {{.Health}}' | grep -c '^api healthy')" = 1 ]; then
    echo "Deploy ok: $GIT_SHA ($ref)"; exit 0
  fi
  sleep 2
done
echo "FEHLER: api wurde nicht gesund; Logs: ${compose[*]} logs api" >&2
exit 1
