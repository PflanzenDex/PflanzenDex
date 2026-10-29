#!/usr/bin/env bash
# Smoke test after a deploy (US-DEV-06): the public /health answers with the status only, the API reports the
# expected version on /health/details and the web root is served. Exit 0 = ok, 1 = failed, 2 = usage error.
# Usage: smoke.sh <base-url> <expected-version>
# Env:   SMOKE_RETRIES (default 15), SMOKE_DELAY seconds between tries (default 2),
#        SMOKE_CURL_OPTS extra curl options (e.g. -k for the local Caddy CA),
#        SMOKE_DETAILS_CMD command that prints the /health/details JSON; the proxy does not serve it on the public
#        name (#759), so deploy.sh reads it inside the api container. Default: curl <base-url>/health/details.
set -uo pipefail

base="${1:-}"
expected="${2:-}"
if [ -z "$base" ] || [ -z "$expected" ]; then echo "usage: smoke.sh <base-url> <expected-version>" >&2; exit 2; fi
base="${base%/}"
retries="${SMOKE_RETRIES:-15}"
delay="${SMOKE_DELAY:-2}"
read -r -a extra <<< "${SMOKE_CURL_OPTS:-}"

# Extracts the string value of "version" from the /health/details JSON (no jq needed on the host).
health_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

details() {
  if [ -n "${SMOKE_DETAILS_CMD:-}" ]; then bash -c "$SMOKE_DETAILS_CMD"; else curl -fsS --max-time 5 "${extra[@]}" "$base/health/details"; fi
}

check_once() {
  local body got code
  body="$(curl -fsS --max-time 5 "${extra[@]}" "$base/health")" || { echo "smoke: /health not reachable" >&2; return 1; }
  if printf '%s' "$body" | grep -Eq '"(version|commit|checks)"'; then echo "smoke: public /health shows more than the status" >&2; return 1; fi
  body="$(details)" || { echo "smoke: /health/details not readable" >&2; return 1; }
  got="$(printf '%s' "$body" | health_version)"
  if [ "$got" != "$expected" ]; then echo "smoke: /health/details reports version '${got:-none}', expected '$expected'" >&2; return 1; fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${extra[@]}" "$base/")" || code=000
  if [ "$code" != 200 ]; then echo "smoke: web root answered HTTP $code, expected 200" >&2; return 1; fi
}

for ((i = 1; i <= retries; i++)); do
  if check_once; then echo "smoke ok: $expected at $base"; exit 0; fi
  [ "$i" -lt "$retries" ] && sleep "$delay"
done
echo "smoke FAILED after $retries tries: $base (expected $expected)" >&2
exit 1
