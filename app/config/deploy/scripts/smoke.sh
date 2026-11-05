#!/usr/bin/env bash
# Smoke test after a deploy (US-DEV-06, #759, #1404). Two parts:
#  1. Health, version and web root: the public /health answers the status only, the api reports the expected version on
#     /health/details and the web root is served. Retried, because the proxy needs a moment.
#  2. Sign-in and Heute, only when SMOKE_USER and SMOKE_PASSWORD are set: the tester signs in as a browser does (code flow
#     with PKCE, the public client pflanzendex-web, no direct grant), then GET /api/today ("Heute") answers 200 with its
#     date and items. Without the two values this part is skipped, and the output says so (#1404).
# Exit 0 = ok, 1 = failed, 2 = usage error. Runbook: docs/guides/operations/release-and-rollback.md, "Smoke test".
# Usage: smoke.sh <base-url> <expected-version>
# Env:   SMOKE_RETRIES (default 15), SMOKE_DELAY seconds between tries (default 2),
#        SMOKE_CURL_OPTS extra curl options for the app (e.g. -k for the local Caddy CA),
#        SMOKE_DETAILS_CMD command that prints the /health/details JSON; the proxy does not serve it on the public
#        name (#759), so deploy.sh reads it inside the api container. Default: curl <base-url>/health/details.
#        SMOKE_USER, SMOKE_PASSWORD the tester account (app/config/deploy/.env on the host, created by
#        keycloak/smoke-user.sh),
#        SMOKE_AUTH_URL the sign-in service as this host reaches it (default AUTH_URL), SMOKE_AUTH_CURL_OPTS its curl
#        options (deploy.sh sets the Host header behind the proxy), SMOKE_APP_URL the app address that the sign-in service
#        has as redirect (default APP_URL).
set -uo pipefail

base="${1:-}"
expected="${2:-}"
if [ -z "$base" ] || [ -z "$expected" ]; then echo "usage: smoke.sh <base-url> <expected-version>" >&2; exit 2; fi
base="${base%/}"
retries="${SMOKE_RETRIES:-15}"
delay="${SMOKE_DELAY:-2}"
read -r -a extra <<< "${SMOKE_CURL_OPTS:-}"

# The sign-in check (#1404): both credentials or none. A missing one is named in the skip line.
tester="${SMOKE_USER:-}"
tester_password="${SMOKE_PASSWORD:-}"
missing=""
if [ -z "$tester" ] && [ -z "$tester_password" ]; then missing="SMOKE_USER/SMOKE_PASSWORD"
elif [ -z "$tester" ]; then missing="SMOKE_USER"
elif [ -z "$tester_password" ]; then missing="SMOKE_PASSWORD"; fi
auth_url="${SMOKE_AUTH_URL:-${AUTH_URL:-}}"
auth_url="${auth_url%/}"
app_url="${SMOKE_APP_URL:-${APP_URL:-}}"
app_url="${app_url%/}"
read -r -a auth_extra <<< "${SMOKE_AUTH_CURL_OPTS:-}"
if [ -z "$missing" ] && { [ -z "$auth_url" ] || [ -z "$app_url" ]; }; then
  echo "smoke FAILED: the sign-in check needs SMOKE_AUTH_URL (or AUTH_URL) and SMOKE_APP_URL (or APP_URL) (#1404)" >&2
  exit 1
fi

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

healthy=""
for ((i = 1; i <= retries; i++)); do
  if check_once; then healthy=1; break; fi
  [ "$i" -lt "$retries" ] && sleep "$delay"
done
if [ -z "$healthy" ]; then echo "smoke FAILED after $retries tries: $base (expected $expected)" >&2; exit 1; fi

if [ -n "$missing" ]; then
  echo "smoke: sign-in check skipped: $missing not set (#1404)"
  echo "smoke ok: $expected at $base"
  exit 0
fi

# Random characters A-Za-z0-9 (coreutils only, no openssl needed on the host).
random_alnum() { head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }

# Percent-encodes a value for a form body or a query (RFC 3986: unreserved characters stay as they are).
urlencode() {
  local LC_ALL=C s="$1" out="" i c
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [A-Za-z0-9._~-]) out+="$c" ;;
      *) printf -v c '%%%02X' "'$c"; out+="$c" ;;
    esac
  done
  printf '%s' "$out"
}

# PKCE code challenge: BASE64URL(SHA256(verifier)) without padding (RFC 7636, method S256).
s256() {
  local hex
  hex="$(printf '%s' "$1" | sha256sum | cut -d' ' -f1)"
  printf '%b' "$(printf '%s' "$hex" | sed 's/../\\x&/g')" | base64 | tr -d '=\n' | tr '+/' '-_'
}

jar=""

# One sign-in and one Heute call. Returns 0 = ok, 1 = try again, 2 = refused: retrying would not help, and every refused
# sign-in counts against the brute-force protection of the tester account (realm pflanzendex).
signin_once() {
  local verifier challenge state authorize page form action post_url body out status redirect code returned json access resp heute_code heute_body
  verifier="$(random_alnum 64)"
  challenge="$(s256 "$verifier")"
  state="$(random_alnum 24)"
  # 1. The login page with the code challenge. The session cookie goes into the jar, as in a browser.
  authorize="$auth_url/realms/pflanzendex/protocol/openid-connect/auth?client_id=pflanzendex-web&response_type=code&scope=openid%20profile%20email&redirect_uri=$(urlencode "$app_url/")&state=$state&code_challenge=$challenge&code_challenge_method=S256"
  if ! page="$(curl -fsS --max-time 10 "${auth_extra[@]}" -c "$jar" -b "$jar" "$authorize")"; then
    echo "smoke: sign-in: the sign-in service does not answer its login page" >&2
    return 1
  fi
  form="$(printf '%s' "$page" | tr '\n' ' ' | grep -o '<form[^>]*kc-form-login[^>]*>' | head -n 1)"
  action="$(printf '%s' "$form" | sed -n 's/.*action="\([^"]*\)".*/\1/p' | sed 's/&amp;/\&/g')"
  if [ -z "$action" ]; then
    echo "smoke: sign-in: the login page has no login form (kc-form-login)" >&2
    return 1
  fi
  # Keycloak writes its public address into the form; the request goes to the address this host reaches instead.
  post_url="$auth_url$(printf '%s' "$action" | sed 's#^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]*##')"
  # 2. The login. The credentials go through stdin, so they are on no command line and in no output.
  body="username=$(urlencode "$tester")&password=$(urlencode "$tester_password")"
  if ! out="$(printf '%s' "$body" | curl -sS --max-time 10 "${auth_extra[@]}" -b "$jar" -c "$jar" -o /dev/null -w '%{http_code} %{redirect_url}' --data-binary @- "$post_url")"; then
    echo "smoke: sign-in: the login request failed" >&2
    return 1
  fi
  status="${out%% *}"
  redirect="${out#* }"
  if [ "${status:0:1}" = 5 ]; then echo "smoke: sign-in: the sign-in service answered HTTP $status" >&2; return 1; fi
  case "$redirect" in
    "$app_url/"*) ;;
    *)
      echo "smoke: sign-in refused: the sign-in service did not return to the app (HTTP $status): SMOKE_USER or SMOKE_PASSWORD is wrong, or an action is pending for the tester (#1404)" >&2
      return 2
      ;;
  esac
  code="$(printf '%s' "$redirect" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
  returned="$(printf '%s' "$redirect" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')"
  if [ -z "$code" ] || [ "$returned" != "$state" ]; then
    echo "smoke: sign-in refused: the redirect to the app carries no code for this sign-in (HTTP $status) (#1404)" >&2
    return 2
  fi
  # 3. The code for a token. The verifier proves that this check started the sign-in (PKCE).
  if ! json="$(printf 'grant_type=authorization_code&code=%s&redirect_uri=%s&client_id=pflanzendex-web&code_verifier=%s' "$(urlencode "$code")" "$(urlencode "$app_url/")" "$verifier" | curl -fsS --max-time 10 "${auth_extra[@]}" --data-binary @- "$auth_url/realms/pflanzendex/protocol/openid-connect/token")"; then
    echo "smoke: sign-in: the token request failed" >&2
    return 1
  fi
  access="$(printf '%s' "$json" | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [ -z "$access" ]; then echo "smoke: sign-in: the token answer has no access token" >&2; return 1; fi
  # 4. Heute with the token. The token reaches curl as a config line on stdin, not on its command line.
  if ! resp="$(printf 'header = "Authorization: Bearer %s"\n' "$access" | curl -sS --max-time 10 "${extra[@]}" -K - -w '\n%{http_code}' "$base/api/today?timeZone=Europe%2FBerlin")"; then
    echo "smoke: Heute: the request failed" >&2
    return 1
  fi
  heute_code="${resp##*$'\n'}"
  heute_body="${resp%$'\n'*}"
  if [ "$heute_code" != 200 ]; then echo "smoke: Heute answered HTTP $heute_code, expected 200" >&2; return 1; fi
  if ! printf '%s' "$heute_body" | grep -Eq '"date"[[:space:]]*:[[:space:]]*"[0-9]{4}-[0-9]{2}-[0-9]{2}"' ||
    ! printf '%s' "$heute_body" | grep -Eq '"items"[[:space:]]*:[[:space:]]*\['; then
    echo "smoke: Heute answered HTTP 200 without its date and items" >&2
    return 1
  fi
  echo "smoke: sign-in ok and Heute answered for the smoke user (#1404)"
  return 0
}

# Runs the sign-in and Heute until one try passes, up to <retries> tries. A refused sign-in ends at once.
signin_check() {
  jar="$(mktemp)" || { echo "smoke FAILED: no temporary file for the sign-in" >&2; exit 1; }
  trap 'rm -f "$jar"' EXIT
  local n rc
  for ((n = 1; n <= retries; n++)); do
    rc=0
    signin_once || rc=$?
    if [ "$rc" = 0 ]; then echo "smoke ok: $expected at $base"; exit 0; fi
    if [ "$rc" = 2 ]; then echo "smoke FAILED: sign-in refused, not retried: $base (expected $expected)" >&2; exit 1; fi
    [ "$n" -lt "$retries" ] && sleep "$delay"
  done
  echo "smoke FAILED after $retries tries: sign-in or Heute: $base (expected $expected)" >&2
  exit 1
}

signin_check
