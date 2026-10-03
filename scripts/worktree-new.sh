#!/usr/bin/env bash
# Creates a branch and worktree for one task (US-DEV-08): one task, one branch, one working directory.
# Usage: scripts/worktree-new.sh <branch>   e.g. feat/dev-08-parallel
# The branch starts from origin/dev (or continues origin/<branch> when `make claim` created it); the directory is .worktrees/<name>/.
# Unique ports and database names go into .worktrees/<name>/.env.worktree (see worktree-env.mjs).
set -euo pipefail

branch="${1:-}"
[ -n "$branch" ] || { echo "usage: $0 <branch>" >&2; exit 2; }

root="$(git rev-parse --show-toplevel)"
dir="$root/.worktrees/${branch//\//-}"
[ ! -e "$dir" ] || { echo "worktree already exists: $dir" >&2; exit 1; }
git show-ref --verify --quiet "refs/heads/$branch" && { echo "branch already exists locally: $branch" >&2; exit 1; }

# Claim check (US-DEV-08): refuse stories claimed by someone else or not claimed yet.
# Explicit opt-out only: make worktree BRANCH=... SKIP_CLAIM_CHECK=1
node "$root/app/scripts/claim-check.mjs" worktree "$branch" || {
  echo "worktree refused: see above, or opt out with SKIP_CLAIM_CHECK=1 (Docs/operations/parallel-work.md)" >&2
  exit 1
}

git fetch --quiet origin dev
git fetch --quiet origin "$branch" 2>/dev/null || true
if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  # The branch exists on origin (created by `make claim`): continue it, never branch off dev again.
  git worktree add -b "$branch" "$dir" "origin/$branch"
  git -C "$dir" branch --set-upstream-to="origin/$branch" "$branch" > /dev/null
else
  git worktree add -b "$branch" "$dir" origin/dev
fi
node "$root/app/scripts/worktree-env.mjs" "$branch" > "$dir/.env.worktree"

echo "Worktree: $dir"
echo "Environment: $dir/.env.worktree"
cat "$dir/.env.worktree"
