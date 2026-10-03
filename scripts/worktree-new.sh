#!/usr/bin/env bash
# Legt für eine Aufgabe Branch + Worktree an (US-DEV-08): ein Task, ein Branch, ein Arbeitsverzeichnis.
# Aufruf: scripts/worktree-new.sh <branch>   z. B. feat/dev-08-parallel
# Der Branch startet von origin/dev, das Verzeichnis liegt unter .worktrees/<name>/.
# Eindeutige Ports/Datenbanknamen landen in .worktrees/<name>/.env.worktree (siehe worktree-env.mjs).
set -euo pipefail

branch="${1:-}"
[ -n "$branch" ] || { echo "Aufruf: $0 <branch>" >&2; exit 2; }

root="$(git rev-parse --show-toplevel)"
dir="$root/.worktrees/${branch//\//-}"
[ ! -e "$dir" ] || { echo "Worktree existiert schon: $dir" >&2; exit 1; }
git show-ref --verify --quiet "refs/heads/$branch" && { echo "Branch existiert schon lokal: $branch" >&2; exit 1; }

git fetch --quiet origin dev
git worktree add -b "$branch" "$dir" origin/dev
node "$root/app/scripts/worktree-env.mjs" "$branch" > "$dir/.env.worktree"

echo "Worktree: $dir"
echo "Umgebung: $dir/.env.worktree"
cat "$dir/.env.worktree"
