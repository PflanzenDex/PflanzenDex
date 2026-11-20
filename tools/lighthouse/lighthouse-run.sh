#!/usr/bin/env bash
# Lighthouse runs of the gate QG-U1 (FR-QG-09): 3 mobile runs against `vite preview` of the built web app.
# Reports go to app/packages/web/.lighthouseci; Chrome comes from the machine (CHROME_PATH or chrome-launcher lookup).
# The port is E2E_WEB_PORT (a worktree's own, set by make from .env.worktree) or 4173.
# Before anything starts, a port in use stops the run (issue 1745): something answers HTTP on it, or a listener holds it.
# The listener is looked up with ss where it exists (CI) and with lsof on macOS, which has no ss (issue 1733). With neither
# installed the run refuses, because it cannot tell whether the port is free.
# After the preview answers, the page it serves must be dist/index.html of the build just made (served-build.mjs, issue
# 1733): a stale preview on the port would be measured without a word. The Lighthouse runs start only after that check.
# The preview has a process group of its own, and the exit stops that group, so no child of the preview survives the run.
#
# Sign-in authority (issue 1733): the Makefile's `lighthouse` target builds with VITE_OIDC_AUTHORITY on port 9, where nothing
# listens, as in CI (CI has no Keycloak). Measured locally with the authority of a local Keycloak instead, the start page
# redirects to the sign-in with prompt=none, and Keycloak rejects redirect_uri 4173 with 400 (the realm accepts only 5173
# and the worktree ports that app/tools/keycloak/web-port.mjs adds). The page measured would then not be the page CI measures.
# dist/ keeps this build afterwards: anything that serves dist/ for a real sign-in builds again first (the signed-in run and
# the UI gates do).
set -euo pipefail
web="$(cd "$(dirname "$0")/../../app/packages/web" && pwd)"
here="$(cd "$(dirname "$0")" && pwd)"
out="$web/.lighthouseci"
port="${E2E_WEB_PORT:-4173}"

# A listener on the port: ss where it exists (Linux, CI), else lsof (macOS). Neither installed: refuse (see above).
listening() {
  if command -v ss >/dev/null 2>&1; then
    [ -n "$(ss -Htln "sport = :$port" 2>/dev/null || true)" ]
  elif command -v lsof >/dev/null 2>&1; then
    [ -n "$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)" ]
  else
    echo "lighthouse: neither ss nor lsof is installed; cannot check port $port (install iproute2 or lsof)" >&2
    exit 1
  fi
}
# In use: something answers HTTP on the port, or a listener holds it (a server that does not speak HTTP).
if curl -s -o /dev/null --max-time 2 "http://localhost:$port/" || listening; then
  echo "lighthouse: port $port is already in use; stop the process that holds it (lsof -nP -iTCP:$port -sTCP:LISTEN, or ss -ltnp on Linux, shows it) or set another E2E_WEB_PORT" >&2
  exit 1
fi
rm -rf "$out"
mkdir -p "$out"
cd "$web"
# setsid: the preview starts a new session and process group whose id is its pid; npx and the vite child stay in that group.
setsid npx vite preview --port "$port" --strictPort >"$out/server.log" 2>&1 &
server=$!
trap 'kill -- -"$server" 2>/dev/null || true' EXIT
# --max-time: a listener that accepts and never answers must not stall the wait (issue 1733).
for _ in $(seq 30); do curl -sf --max-time 2 "http://localhost:$port/" >/dev/null && break; sleep 1; done
curl -sf --max-time 2 "http://localhost:$port/" >/dev/null || { echo "preview server did not start" >&2; cat "$out/server.log" >&2; exit 1; }
# The server that answers must serve the build just made, before any Lighthouse run (issue 1733).
node "$here/preview/served-build.mjs" "http://localhost:$port/" "$web/dist/index.html"
for i in 1 2 3; do
  npm run --silent lighthouse -- "http://localhost:$port/" --form-factor=mobile --quiet \
    --only-categories=performance,accessibility,best-practices,seo \
    --chrome-flags="--no-sandbox --headless=new" --output=json --output-path="$out/run-$i.json"
done
