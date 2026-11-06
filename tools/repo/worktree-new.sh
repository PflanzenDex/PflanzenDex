#!/usr/bin/env bash
# Creates a branch and worktree for one task (US-DEV-08): one task, one branch, one working directory.
# Usage: tools/repo/worktree-new.sh <branch>   e.g. feat/dev-08-parallel
# The branch starts from origin/dev (or continues origin/<branch> when `make claim` created it).
# The directory is <main checkout>/.worktrees/<name>/, also when this runs inside another worktree (#1487: it used to nest).
# Dependencies (#1487): an install with the same package-lock.json is copied when one exists (worktree-env.mjs --deps); then `make setup`
# runs there: it installs when nothing was copied and skips npm ci when the stamp matches. The worktree is ready to commit in.
# Unique ports and database names go into .worktrees/<name>/.env.worktree (see app/tools/workflow/worktree/worktree-env.mjs).
set -euo pipefail

branch="${1:-}"
[ -n "$branch" ] || { echo "usage: $0 <branch>" >&2; exit 2; }

# The tools come from the checkout this runs in; the worktrees belong to the main checkout (its git common dir).
here="$(git rev-parse --show-toplevel)"
main="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
dir="$main/.worktrees/${branch//\//-}"
[ ! -e "$dir" ] || { echo "worktree already exists: $dir" >&2; exit 1; }
git show-ref --verify --quiet "refs/heads/$branch" && { echo "branch already exists locally: $branch" >&2; exit 1; }

# Claim check (US-DEV-08): refuse stories claimed by someone else or not claimed yet.
# Explicit opt-out only: make worktree BRANCH=... SKIP_CLAIM_CHECK=1
if [ "${SKIP_CLAIM_CHECK:-}" = 1 ]; then
  echo "claim: check skipped (SKIP_CLAIM_CHECK=1)"
else
  node "$here/app/tools/workflow/claim/claim-check.mjs" worktree "$branch" || {
    echo "worktree refused: see above, or opt out with SKIP_CLAIM_CHECK=1 (docs/guides/operations/parallel-work.md)" >&2
    exit 1
  }
fi

git fetch --quiet origin dev
git fetch --quiet origin "$branch" 2>/dev/null || true
if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  # The branch exists on origin (created by `make claim`): continue it, never branch off dev again.
  git worktree add -b "$branch" "$dir" "origin/$branch"
  git -C "$dir" branch --set-upstream-to="origin/$branch" "$branch" > /dev/null
else
  git worktree add -b "$branch" "$dir" origin/dev
fi
node "$here/app/tools/workflow/worktree/worktree-env.mjs" "$branch" > "$dir/.env.worktree"

echo "Worktree: $dir"
echo "Environment: $dir/.env.worktree"
cat "$dir/.env.worktree"

# Dependencies (#1487): reuse an install with the same lock file; make setup then checks the stamp (npm ci only when it does not match).
node "$here/app/tools/workflow/worktree/worktree-env.mjs" --deps "$dir/app" "$here/app" \
  || echo "deps: no copy, make setup installs them" >&2
if ! make -C "$dir" setup; then
  echo "worktree is there, but make setup failed in $dir: run make setup there before the first commit" >&2
  exit 1
fi
echo "Ready to commit in $dir: dependencies match package-lock.json and the git hooks are on."
