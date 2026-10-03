#!/usr/bin/env bash
# Report-only Lighthouse run (QG-U1): 3 mobile runs against `vite preview` of the built web app.
# Reports go to app/packages/web/.lighthouseci; Chrome comes from the machine (CHROME_PATH or chrome-launcher lookup).
set -euo pipefail
web="$(cd "$(dirname "$0")/../app/packages/web" && pwd)"
out="$web/.lighthouseci"
port=4173
rm -rf "$out"
mkdir -p "$out"
cd "$web"
npx vite preview --port "$port" --strictPort >"$out/server.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for _ in $(seq 30); do curl -sf "http://localhost:$port/" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$port/" >/dev/null || { echo "preview server did not start" >&2; cat "$out/server.log" >&2; exit 1; }
for i in 1 2 3; do
  npm run --silent lighthouse -- "http://localhost:$port/" --form-factor=mobile --quiet \
    --only-categories=performance,accessibility,best-practices,seo \
    --chrome-flags="--no-sandbox --headless=new" --output=json --output-path="$out/run-$i.json"
done
