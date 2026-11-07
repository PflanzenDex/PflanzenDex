#!/bin/sh
# US-QG-01 (issue 1485): the browser install of a CI job (`make browsers`). `playwright install --with-deps chromium` first
# installs the system packages with apt, then downloads the browser. Two things make it take long in CI:
# - the apt download (21 MB) can run at about 40 kB/s for ten minutes on a throttled Ubuntu mirror (runs 42195310952 and
#   42198355749), so each part gets a time limit above that throttled time and one retry;
# - the packages are cached (PFLANZENDEX_APT_CACHE): a cache hit installs without touching the mirror.
# apt still checks every package against the signed index, so a stale or damaged cached file costs time, never correctness.
# Only a complete install is kept: the packages go to the cache folder, and only after the browser is proved present, and
# a marker file `COMPLETE` says so for the save step. A failing part fails the job; nothing passes silently.
# Environment (seconds and folders; the defaults are the CI values):
#   PFLANZENDEX_BROWSER_SYSTEM_LIMIT (720), PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT (180),
#   PFLANZENDEX_APT_CACHE (empty: no cache), PFLANZENDEX_APT_ARCHIVES (/var/cache/apt/archives).
#   PFLANZENDEX_BROWSER_EXECUTABLE: the browser to prove present; the tests set it, CI asks Playwright.
set -eu

ARCHIVES="${PFLANZENDEX_APT_ARCHIVES:-/var/cache/apt/archives}"
CACHE="${PFLANZENDEX_APT_CACHE:-}"
SYSTEM_LIMIT="${PFLANZENDEX_BROWSER_SYSTEM_LIMIT:-720}"
DOWNLOAD_LIMIT="${PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT:-180}"

# attempt <limit in seconds> <what> <apt|plain> <command...>: runs the command, stops it after the limit, retries it once.
# Only an apt part repairs apt and dpkg before its retry: the download runs at the same time and must not stop apt.
attempt() {
  limit=$1
  what=$2
  kind=$3
  shift 3
  try=1
  while :; do
    if timeout -k 10 "$limit" "$@"; then
      return 0
    fi
    echo "browsers: $what failed or took longer than $limit s (attempt $try of 2)" >&2
    if [ "$try" -ge 2 ]; then
      return 1
    fi
    try=$((try + 1))
    if [ "$kind" != apt ]; then
      continue
    fi
    # A stopped apt-get can leave dpkg locked, and under sudo the process may run outside the group that timeout stops.
    # So the leftovers are killed and dpkg is brought back to a consistent state before the retry. Finding no process
    # to kill is normal, which is why only pkill gets `|| true`.
    sudo pkill -KILL -x apt-get || true
    sudo pkill -KILL -x dpkg || true
    sudo dpkg --configure -a
  done
}

if [ -n "$CACHE" ]; then
  # apt removes the packages after an install unless told to keep them; the cache needs them.
  sudo tee /etc/apt/apt.conf.d/99pflanzendex-keep-packages > /dev/null <<'CONF'
Binary::apt::APT::Keep-Downloaded-Packages "true";
CONF
  # Restore: the packages of an earlier complete install (`cp -n` never overwrites a file apt has already put there).
  if ls "$CACHE"/*.deb > /dev/null 2>&1; then
    echo "browsers: restoring the cached system packages from $CACHE"
    sudo cp -n "$CACHE"/*.deb "$ARCHIVES"/
  else
    echo "browsers: no cached system packages in $CACHE, the mirror is used"
  fi
fi

# The two parts touch different things (apt and the system packages; the browser in the Playwright cache), so they run at
# the same time and the install takes as long as the slower one (issue 1667). Each keeps its own limit and retry, and the
# install fails when either part failed.
attempt "$SYSTEM_LIMIT" "system packages (apt)" apt npx --no-install playwright install-deps chromium &
system=$!
attempt "$DOWNLOAD_LIMIT" "Chromium download" plain npx --no-install playwright install chromium &
download=$!
failed=0
wait "$system" || failed=1
wait "$download" || failed=1
if [ "$failed" -ne 0 ]; then
  exit 1
fi

# The browser must be there before any test starts: the executable that Playwright launches has to exist.
browser="${PFLANZENDEX_BROWSER_EXECUTABLE:-$(cd packages/e2e && node -e "process.stdout.write(require('@playwright/test').chromium.executablePath())")}"
if [ ! -x "$browser" ]; then
  echo "browsers: no Chromium at '$browser' after the install" >&2
  exit 1
fi

if [ -n "$CACHE" ]; then
  mkdir -p "$CACHE"
  kept=$(ls "$ARCHIVES"/*.deb 2>/dev/null | wc -l)
  if [ "$kept" -gt 0 ] && cp "$ARCHIVES"/*.deb "$CACHE"/ && touch "$CACHE/COMPLETE"; then
    echo "browsers: kept $kept system packages for the cache"
  else
    echo "browsers: no complete set of system packages to keep; the cache is not saved" >&2
  fi
fi
