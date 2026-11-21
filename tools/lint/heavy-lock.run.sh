#!/usr/bin/env bash
# One command under the heavy lock (US-DEV-08, issue 2370). `make heavy RUN="<command>"` takes the machine-wide lock through its
# prerequisite `heavy-lock` (tools/lint/heavy-lock.sh), then runs this script. The lock belongs to the make process
# (PFLANZENDEX_HEAVY_OWNER), so it is held around this one command and released when make ends.
#
# The command arrives as RAW_RUN, a raw environment variable that make never expands. It runs with bash -c in its own session
# and process group, and this script exits with the command's exit code. INT, TERM and HUP are forwarded to that group. A
# watchdog in a session of its own stops the group when this script or the owner ends first: a SIGKILL gives no trap, so the
# group cannot rely on one. When the command has ended, what is left of its group is stopped too. Usage: heavy-lock.run.sh [owner
# pid]; the owner defaults to the parent of this script. In CI the lock is a no-op (heavy-lock.sh), and the command runs too.
set -euo pipefail

command -v setsid > /dev/null || { echo "heavy-lock.run: needs setsid (util-linux)" >&2; exit 2; }

cmd="${RAW_RUN:-}"
if [ -z "${cmd//[[:space:]]/}" ]; then
  echo 'heavy-lock.run: RAW_RUN is empty; usage: make heavy RUN="<command>"' >&2
  exit 2
fi
owner="${1:-$PPID}"
case "$owner" in
  "" | *[!0-9]*) echo "heavy-lock.run: the owner must be a pid, got '$owner'" >&2; exit 2 ;;
esac

# The command, in its own session: its pid is its process group id. Its input is /dev/null, so it cannot read the terminal. The
# subshell resets SIGINT before it execs setsid (the exec keeps the pid, and setsid does not fork here): bash starts an
# asynchronous job with SIGINT ignored, and the command would then ignore the INT forwarded below (US-DEV-08, issue 2370).
child=""
( trap - INT; exec setsid bash -c "$cmd" ) < /dev/null &
child=$!

# The watchdog: it stops the group once this script or the owner is gone (TERM, then KILL after two seconds). Its output goes
# nowhere, so the pipes of make do not wait for it.
setsid bash -c '
  while kill -0 "$1" 2> /dev/null && kill -0 "$2" 2> /dev/null; do sleep 1; done
  kill -TERM -- -"$3" 2> /dev/null || exit 0
  sleep 2
  kill -KILL -- -"$3" 2> /dev/null || true
' watchdog "$$" "$owner" "$child" < /dev/null > /dev/null 2>&1 &

# A signal to this script goes to the group of the command; wait_command then returns with the command's exit code.
forward() {
  kill -"$1" -- -"$child" 2> /dev/null || true
}
trap 'forward INT' INT
trap 'forward TERM' TERM
trap 'forward HUP' HUP
# What is left of the group ends with this script: a child of the command may outlive it.
trap 'kill -TERM -- -"$child" 2> /dev/null || true' EXIT

# The exit code of the command. A forwarded signal ends wait early while the command still runs, so wait again then.
wait_command() {
  local rc=0
  wait "$child" || rc=$?
  while [ "$rc" -gt 128 ] && kill -0 "$child" 2> /dev/null; do
    rc=0
    wait "$child" || rc=$?
  done
  return "$rc"
}

rc=0
wait_command || rc=$?
exit "$rc"
