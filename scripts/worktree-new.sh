#!/usr/bin/env bash
# Creates a branch and worktree for one task (US-DEV-08): one task, one branch, one working directory.
# Usage: scripts/worktree-new.sh <branch>   e.g. feat/dev-08-parallel
# The branch starts from origin/dev; the directory is .worktrees/<name>/.
# Unique ports and database names go into .worktrees/<name>/.env.worktree (see worktree-env.mjs).
set -euo pipefail

branch="${1:-}"
[ -n "$branch" ] || { echo "usage: $0 <branch>" >&2; exit 2; }

root="$(git rev-parse --show-toplevel)"
dir="$root/.worktrees/${branch//\//-}"
[ ! -e "$dir" ] || { echo "worktree already exists: $dir" >&2; exit 1; }
git show-ref --verify --quiet "refs/heads/$branch" && { echo "branch already exists locally: $branch" >&2; exit 1; }

git fetch --quiet origin dev
git worktree add -b "$branch" "$dir" origin/dev
node "$root/app/scripts/worktree-env.mjs" "$branch" > "$dir/.env.worktree"

echo "Worktree: $dir"
echo "Environment: $dir/.env.worktree"
cat "$dir/.env.worktree"
