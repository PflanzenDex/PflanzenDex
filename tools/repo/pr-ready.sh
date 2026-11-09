#!/usr/bin/env bash
# `make pr [PR=<n>]` (US-DEV-13, issue 1608): the step before a pull request goes to review. Order: the refusals, the pull
# request read over REST, a preflight (commitlint on the title, `make changelog-check`, the Lessons section of the body
# (US-DEV-05), the checks of CI's `metadata` job), the push, a wait until GitHub shows the pushed head, and only then the PR is marked ready. A draft runs no CI
# (ci.yml), so the `ready_for_review` run is the one CI run of the PR, and it tests the head that was pushed.
# It does not touch README.md: the statistics block changes with every merge into dev, so regenerating it per PR made
# parallel PRs conflict (owner decision 2026-10-05). The block is regenerated once per release PR (skill release-checklist)
# or by hand with `make repo-stats`.
# Refuses, and changes nothing, on main/dev, a detached HEAD, a rebase/merge/cherry-pick/revert in progress or uncommitted
# changes: what is pushed must be what was reviewed locally. Without PR=<n>, the open PR of the current branch is found over REST.
# A failed preflight pushes nothing and marks nothing. A failure after the push (no head on GitHub within PR_READY_HEAD_WAIT
# seconds, a gh error, the GraphQL rate limit) leaves the branch pushed and the PR a draft, and says so. Running `make pr`
# again is safe: the push and the mark can be repeated.
# Marking ready has no REST route, so it spends GraphQL points. On a rate limit it waits for the reset, at most
# PR_READY_TRIES attempts and PR_READY_MAX_WAIT seconds per wait (FR-DEV-10, issue 1412). Then it exits 75: the PR is still a
# draft, and `make pr` runs again after the reset. No endless loop.
# The head wait polls GitHub every 3 seconds (starting value PR_READY_HEAD_WAIT=60 seconds, assumption); jq reads the answers.
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
head_wait="${PR_READY_HEAD_WAIT:-60}"

# The pull request over REST (issue 1608): the GraphQL budget is spent by the mark only. Title and body stay in shell
# variables and reach the checks only through the environment, never in a command string.
read_failed() { echo "pr-ready: could not read the pull request over REST; nothing was pushed or marked" >&2; exit 1; }
if [ -n "$pr" ]; then
  pull_json="$(gh api "repos/{owner}/{repo}/pulls/$pr")" || read_failed
else
  listed="$(gh api "repos/{owner}/{repo}/pulls?state=open&head={owner}:$(printf '%s' "$branch" | jq -sRr '@uri')")" || read_failed
  count="$(jq 'length' <<<"$listed")"
  [ "$count" = 1 ] || refuse "branch $branch has $count open pull requests, expected one (pass PR=<n>)"
  pull_json="$(jq '.[0]' <<<"$listed")"
  pr="$(jq -r '.number' <<<"$pull_json")"
fi
pr_endpoint="repos/{owner}/{repo}/pulls/$pr"
field() { jq -r "$1" <<<"$pull_json"; }
title="$(field '.title // ""')" || read_failed
body="$(field '.body // ""')" || read_failed
base_ref="$(field '.base.ref // ""')" || read_failed
base_sha="$(field '.base.sha // ""')" || read_failed
head_before="$(field '.head.sha // ""')" || read_failed

# Preflight (issue 1608): the checks of CI's `metadata` job, before anything is pushed. The changelog check reads the commits
# of this clone, so the base commit must be here; it is fetched when it is missing.
if ! git cat-file -e "$base_sha^{commit}" 2>/dev/null; then
  git fetch -q origin "$base_sha" 2>/dev/null || git fetch -q origin "$base_ref" 2>/dev/null || true
fi
git cat-file -e "$base_sha^{commit}" 2>/dev/null || {
  echo "pr-ready: the base commit $base_sha is not in this clone and could not be fetched; nothing was pushed or marked" >&2
  exit 1
}
if ! MSG="$title" make -s commitlint; then
  echo "pr-ready: the PR title fails commitlint; nothing was pushed or marked. Fix the title with make pr-text TITLE=\"<type(scope): subject>\", then run make pr again." >&2
  exit 1
fi
if ! PR_TITLE="$title" PR_BODY="$body" PR_BASE_SHA="$base_sha" PR_BASE_REF="$base_ref" make -s changelog-check; then
  echo "pr-ready: the changelog check fails; nothing was pushed or marked. Add the news entry (app/packages/web/src/news/unreleased/<issue>-<slug>.json) or [skip-changelog] to the PR body (make pr-text BODY=<file>), then run make pr again." >&2
  exit 1
fi
# The Lessons section (US-DEV-05, issue 1747): one line per lesson or `none`. The check prints the problems and the pointer to
# the skill recap-and-learnings; the PR body is passed in the environment only.
if ! PR_BODY="$body" node app/tools/check/docs/agents/pr/pr-lessons.mjs; then
  echo "pr-ready: the Lessons section of the PR body fails; nothing was pushed or marked. Fill it with make pr-text BODY=<file> (the lessons come from the skill recap-and-learnings), then run make pr again." >&2
  exit 1
fi

if ! git push; then
  echo "pr-ready: the push failed; the PR is not marked ready and no CI started. Fix the cause, then run make pr${pr:+ PR=$pr} again." >&2
  exit 1
fi

# GitHub shows the pushed head within seconds. The mark waits for it, so the `ready_for_review` run tests this head (issue 1608).
local_head="$(git rev-parse HEAD)"
shown_head() { { gh api "$pr_endpoint" 2>/dev/null || echo '{}'; } | jq -r '.head.sha // ""'; }
waited=0
while :; do
  shown="$(shown_head)"
  [ "$shown" = "$local_head" ] && break
  if [ "$waited" -ge "$head_wait" ]; then
    echo "pr-ready: GitHub shows ${shown:-no head} for PR $pr after $head_wait s, not the pushed $local_head (it showed $head_before before the push). The branch is pushed, the PR is still a draft and no CI started. Run make pr PR=$pr again." >&2
    exit 1
  fi
  sleep 3
  waited=$((waited + 3))
done

# Reset time (epoch seconds) from the headers of a failing GraphQL call; empty when none is returned. The counters of
# `gh api rate_limit` can lag behind, the header of the failing response does not.
graphql_reset() {
  gh api -i graphql -f 'query={ viewer { login } }' 2>/dev/null | tr -d '\r' \
    | awk -F': ' 'tolower($1) == "x-ratelimit-reset" { print $2; exit }'
}

attempt=1
while :; do
  if out="$(gh pr ready "$pr" 2>&1)"; then
    [ -z "$out" ] || echo "$out"
    break
  fi
  echo "$out" >&2
  printf '%s' "$out" | grep -qi 'rate limit' || {
    echo "pr-ready: marking the PR ready failed; the branch is pushed, the PR is still a draft and no CI started. Fix the cause, then run make pr PR=$pr again." >&2
    exit 1
  }

  now="$(date +%s)"
  reset="$(graphql_reset || true)"
  [ -n "$reset" ] || reset=$((now + 60))
  wait=$((reset - now))
  [ "$wait" -ge 0 ] || wait=0
  if [ "$attempt" -ge "$tries" ] || [ $((wait + 2)) -gt "$max_wait" ]; then
    when="$(date -d "@$reset" +%H:%M 2>/dev/null || echo "$reset")"
    echo "pr-ready: the GraphQL rate limit is still reached; the branch is pushed, the PR is still a draft and no CI started." >&2
    echo "pr-ready: when the budget is back (about $when, local time) run: make pr PR=$pr" >&2
    exit 75
  fi
  echo "pr-ready: rate limit reached; retry $((attempt + 1)) of $tries in $((wait + 2))s" >&2
  sleep $((wait + 2))
  attempt=$((attempt + 1))
done
