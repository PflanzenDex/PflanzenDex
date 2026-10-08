#!/usr/bin/env bash
# `make pr [PR=<n>]` (US-DEV-10): the step before a pull request goes to review. Pushes the branch and marks the PR
# ready. It does not touch README.md: the statistics block changes with every merge into dev, so regenerating it
# per PR made parallel PRs conflict (owner decision 2026-10-05). The block is regenerated once per release PR
# (skill release-checklist) or by hand with `make repo-stats`.
# Refuses, and changes nothing, on main/dev, a detached HEAD, a rebase/merge/cherry-pick/revert in progress or
# uncommitted changes: what is pushed must be what was reviewed locally.
# Without PR=<n>, `gh` finds the PR of the current branch.
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

git push
if [ -n "$pr" ]; then gh pr ready "$pr"; else gh pr ready; fi
