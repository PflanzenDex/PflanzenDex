#!/usr/bin/env bash
# `make pr [PR=<n>]` (US-DEV-13): the step before a pull request goes to review. Pushes the branch and marks the PR
# ready. Order (#1547): the PR is marked ready first, then the branch is pushed. The push starts the `synchronize`
# run on a PR that is not a draft, where the CI job `metadata` runs (it skips drafts); a `ready_for_review` run covers
# only the head it starts on. It does not touch README.md: the statistics block changes with every merge into dev, so regenerating it
# per PR made parallel PRs conflict (owner decision 2026-10-05). The block is regenerated once per release PR
# (skill release-checklist) or by hand with `make repo-stats`.
# Refuses, and changes nothing, on main/dev, a detached HEAD, a rebase/merge/cherry-pick/revert in progress or
# uncommitted changes: what is pushed must be what was reviewed locally.
# Without PR=<n>, `gh` finds the PR of the current branch.
# Marking ready has no REST route, so it spends GraphQL points. On a rate limit it waits for the reset, at most
# PR_READY_TRIES attempts and PR_READY_MAX_WAIT seconds per wait (FR-DEV-10, #1412). Then it exits 75 and pushes nothing:
# the PR is still a draft, and `make pr` runs again after the reset. No endless loop.
# A gh error that is not a rate limit exits 1 and pushes nothing. If marking ready works and the push fails, the PR stays
# ready for review with its previous head and the script exits 1. `make pr` can run again: `gh pr ready` on a PR that is
# already ready says so and exits 0 (checked with gh 2.102.1 on PR 1533; pr-ready.test.mjs fakes that answer).
set -euo pipefail

pr="${1:-}"
root="$(git rev-parse --show-toplevel)"
cd "$root"

refuse() { echo "pr-ready: $1; nothing was changed" >&2; exit 1; }

branch="$(git symbolic-ref --short -q HEAD || true)"
case "$branch" in
  "") refuse "detached HEAD" ;;
  main | dev) refuse "branch $branch takes no direct commits (E-13)" ;;
esac
for op in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
  [ -e "$(git rev-parse --git-path "$op")" ] && refuse "$op in progress"
done
[ -z "$(git status --porcelain)" ] || refuse "uncommitted changes (commit or remove them first)"

tries="${PR_READY_TRIES:-3}"
max_wait="${PR_READY_MAX_WAIT:-300}"
ready_args=()
if [ -n "$pr" ]; then ready_args=("$pr"); fi

# Reset time (epoch seconds) from the headers of a failing GraphQL call; empty when none is returned. The counters of
# `gh api rate_limit` can lag behind, the header of the failing response does not.
graphql_reset() {
  gh api -i graphql -f 'query={ viewer { login } }' 2>/dev/null | tr -d '\r' \
    | awk -F': ' 'tolower($1) == "x-ratelimit-reset" { print $2; exit }'
}

attempt=1
while :; do
  if out="$(gh pr ready ${ready_args[@]+"${ready_args[@]}"} 2>&1)"; then
    [ -z "$out" ] || echo "$out"
    break
  fi
  echo "$out" >&2
  printf '%s' "$out" | grep -qi 'rate limit' || {
    echo "pr-ready: marking the PR ready failed; nothing was pushed" >&2
    exit 1
  }

  now="$(date +%s)"
  reset="$(graphql_reset || true)"
  [ -n "$reset" ] || reset=$((now + 60))
  wait=$((reset - now))
  [ "$wait" -ge 0 ] || wait=0
  if [ "$attempt" -ge "$tries" ] || [ $((wait + 2)) -gt "$max_wait" ]; then
    when="$(date -d "@$reset" +%H:%M 2>/dev/null || echo "$reset")"
    echo "pr-ready: the GraphQL rate limit is still reached; nothing was pushed and the PR is still a draft." >&2
    echo "pr-ready: when the budget is back (about $when, local time) run: make pr${pr:+ PR=$pr}" >&2
    exit 75
  fi
  echo "pr-ready: rate limit reached; retry $((attempt + 1)) of $tries in $((wait + 2))s" >&2
  sleep $((wait + 2))
  attempt=$((attempt + 1))
done

# The PR is ready now. Push after it, so the push's `synchronize` run sees a PR that is not a draft (#1547).
if ! git push; then
  echo "pr-ready: the PR is marked ready, but the push failed: it is ready for review with its previous head. Fix the cause, then run make pr${pr:+ PR=$pr} again." >&2
  exit 1
fi
