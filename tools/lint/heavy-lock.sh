#!/usr/bin/env bash
# One heavy job at a time on this machine (US-DEV-08, issue 1745). The UI gates, Lighthouse, the e2e tests and `make ci` load
# the workstation so much that two of them at once, from two worktrees, got the IDE killed by systemd-oomd. `make heavy-lock`
# runs this script first in those targets. It returns when the machine-wide lock is ours; the lock stays ours until the make
# process that owns it ends. Usage: heavy-lock.sh <owner pid> <target label>. Needs setsid and flock (util-linux).
#
# Files in the git common dir, shared by all worktrees of one checkout: heavy-job.lock is the flock, heavy-job.owner holds one
# line while the lock is held: owner pid, directory, target, time (UTC). The lock is taken by a detached holder (setsid flock),
# which writes the note, waits while the owner pid is alive and releases the lock by exiting, also when the owner is killed or
# fails. A note whose pid is dead does not count: flock alone decides.
#
# A nested call (the note names this owner pid and that pid is alive, e.g. `make e2e` run by `make ci`) returns at once and
# takes no second lock. A lock that is free is taken silently. A wait prints its line after one second, naming the job it waits
# for and the holder, then again every 30 seconds. HEAVY_LOCK_WAIT (seconds, at least 1, default 3600, a starting value) bounds
# the wait: then the script exits 1 and names the holder. HEAVY_LOCK_DIR replaces the git common dir (the tests use it).
# The Makefile does not call this in CI, where CI is set: each CI job is its own machine.
set -euo pipefail

usage() {
  echo "usage: heavy-lock.sh <owner pid> <target>" >&2
  exit 2
}

owner="${1:-}"
target="${2:-}"
[ -n "$target" ] || target=make
case "$owner" in
  "" | *[!0-9]*) usage ;;
esac

wait_s="${HEAVY_LOCK_WAIT:-3600}"
case "$wait_s" in
  "" | *[!0-9]*) echo "heavy-lock: HEAVY_LOCK_WAIT must be a whole number of seconds, got '$wait_s'" >&2; exit 2 ;;
esac
[ "$wait_s" -ge 1 ] || { echo "heavy-lock: HEAVY_LOCK_WAIT must be at least 1 second" >&2; exit 2; }

command -v setsid > /dev/null && command -v flock > /dev/null || {
  echo "heavy-lock: needs setsid and flock (util-linux)" >&2
  exit 2
}

if [ -n "${HEAVY_LOCK_DIR:-}" ]; then
  dir="$HEAVY_LOCK_DIR"
else
  common="$(git rev-parse --git-common-dir 2> /dev/null)" || { echo "heavy-lock: not in a git checkout" >&2; exit 2; }
  dir="$(cd "$common" && pwd)"
fi
[ -d "$dir" ] || { echo "heavy-lock: no folder $dir" >&2; exit 2; }
lock="$dir/heavy-job.lock"
note="$dir/heavy-job.owner"

# The owner pid that the note names, empty when there is no note.
note_owner() {
  local pid=""
  { read -r pid _ < "$note"; } 2> /dev/null || true
  printf '%s' "$pid"
}

# "held by <directory and target> (pid <n>, since <time>)" from the note, empty when there is no note.
holder_text() {
  local line="" pid rest
  { IFS= read -r line < "$note"; } 2> /dev/null || true
  [ -n "$line" ] || return 0
  pid="${line%% *}"
  rest="${line#* }"
  printf 'held by %s (pid %s, since %s)\n' "${rest% *}" "$pid" "${rest##* }"
}

# Nested call: this owner already holds the lock.
if [ "$(note_owner)" = "$owner" ] && kill -0 "$owner" 2> /dev/null; then
  exit 0
fi

since="$(date -u +%FT%TZ)"
started="$(date +%s)"
# The holder: writes the note once it has the lock, waits for the owner, removes the note and exits (releasing the lock).
holder_script='printf "%s %s %s %s\n" "$1" "$2" "$3" "$(date -u +%FT%TZ)" > "$4"
while kill -0 "$1" 2> /dev/null; do sleep 1; done
rm -f "$4"'
setsid flock "$lock" bash -c "$holder_script" holder "$owner" "$PWD" "$target" "$note" \
  < /dev/null > /dev/null 2>&1 &
holder=$!

# Stops our holder (its process group first) and removes the note when the note names us.
stop_holder() {
  kill -TERM -- "-$holder" 2> /dev/null || kill -TERM "$holder" 2> /dev/null || true
  if [ "$(note_owner)" = "$owner" ]; then rm -f "$note"; fi
}

waited=""
next_line=$((started + 1))
while [ "$(note_owner)" != "$owner" ]; do
  now="$(date +%s)"
  if [ "$now" -ge "$next_line" ]; then
    waited=yes
    echo "heavy-lock: waiting for $target in $PWD (since $since), one heavy job at a time (US-DEV-08)"
    holder_text | sed 's/^/heavy-lock: /'
    next_line=$((now + 30))
  fi
  if [ $((now - started)) -ge "$wait_s" ]; then
    stop_holder
    echo "heavy-lock: gave up after $wait_s s, $target in $PWD did not run (HEAVY_LOCK_WAIT); $(holder_text)" >&2
    exit 1
  fi
  if ! kill -0 "$holder" 2> /dev/null && [ "$(note_owner)" != "$owner" ]; then
    echo "heavy-lock: the lock holder ended without the lock (setsid or flock failed?)" >&2
    exit 1
  fi
  sleep 0.5
done

if [ -n "$waited" ]; then
  echo "heavy-lock: the lock is ours after $(($(date +%s) - started)) s, $target starts"
fi
