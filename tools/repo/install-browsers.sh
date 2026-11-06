#!/bin/sh
# US-QG-01 (issue 1485): the browser install of a CI job (`make browsers`), in two parts that each get a time limit and one
# retry. `playwright install --with-deps chromium` first installs the system packages with apt, then downloads the browser.
# In run 42195310952 one job's apt download ran at 39 kB/s for 9 minutes and held the whole gate. Now each part stops after
# its limit (a healthy run takes about 10 s for the apt part and 5 s for the download) and runs once more. A part that fails
# twice fails the job, so nothing passes silently. The same packages and the same browser build are installed:
# `install-deps` and `install` together are `install --with-deps`.
# The limits are seconds: PFLANZENDEX_BROWSER_SYSTEM_LIMIT (default 120) and PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT (default 180).
set -eu

# attempt <limit in seconds> <what> <command...>: runs the command, stops it after the limit, retries it once.
attempt() {
  limit=$1
  what=$2
  shift 2
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
    # A stopped apt-get can leave dpkg locked, and under sudo the process may run outside the group that timeout stops.
    # So the leftovers are killed and dpkg is brought back to a consistent state before the retry. Finding no process
    # to kill is normal, which is why only pkill gets `|| true`.
    sudo pkill -KILL -x apt-get || true
    sudo pkill -KILL -x dpkg || true
    sudo dpkg --configure -a
  done
}

attempt "${PFLANZENDEX_BROWSER_SYSTEM_LIMIT:-120}" "system packages (apt)" npx --no-install playwright install-deps chromium
attempt "${PFLANZENDEX_BROWSER_DOWNLOAD_LIMIT:-180}" "Chromium download" npx --no-install playwright install chromium
