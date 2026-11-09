#!/usr/bin/env bash
# Lighthouse runs of the gate QG-U1 (FR-QG-09): 3 mobile runs against `vite preview` of the built web app.
# Reports go to app/packages/web/.lighthouseci; Chrome comes from the machine (CHROME_PATH or chrome-launcher lookup).
# The port is E2E_WEB_PORT (a worktree's own, set by make from .env.worktree) or 4173. A port that is already in use stops the
# run before anything starts (issue 1745). The preview has a process group of its own, and the exit stops that group, so no
# child of the preview survives the run.
set -euo pipefail
web="$(cd "$(dirname "$0")/../../app/packages/web" && pwd)"
out="$web/.lighthouseci"
port="${E2E_WEB_PORT:-4173}"
# In use: something answers HTTP on the port, or ss lists a listener there (a server that does not speak HTTP).
if curl -s -o /dev/null --max-time 2 "http://localhost:$port/" || [ -n "$(ss -Htln "sport = :$port" 2>/dev/null || true)" ]; then
  echo "lighthouse: port $port is already in use; stop the process that holds it (ss -ltnp shows it) or set another E2E_WEB_PORT" >&2
  exit 1
fi
rm -rf "$out"
mkdir -p "$out"
cd "$web"
# setsid: the preview starts a new session and process group whose id is its pid; npx and the vite child stay in that group.
setsid npx vite preview --port "$port" --strictPort >"$out/server.log" 2>&1 &
server=$!
trap 'kill -- -"$server" 2>/dev/null || true' EXIT
for _ in $(seq 30); do curl -sf "http://localhost:$port/" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$port/" >/dev/null || { echo "preview server did not start" >&2; cat "$out/server.log" >&2; exit 1; }
for i in 1 2 3; do
  npm run --silent lighthouse -- "http://localhost:$port/" --form-factor=mobile --quiet \
    --only-categories=performance,accessibility,best-practices,seo \
    --chrome-flags="--no-sandbox --headless=new" --output=json --output-path="$out/run-$i.json"
done
