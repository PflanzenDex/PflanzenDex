#!/usr/bin/env bash
# Rulesets as code (FR-QG-02, FR-DEV-02, ADR 0001): `.github/rulesets/*.json` is the source of truth, GitHub the copy.
# Usage: scripts/rulesets-apply.sh            applies every file (creates it, or updates it by name)
#        scripts/rulesets-apply.sh --check    only compares, exits 1 on drift
# Needs `gh` with admin rights on the repo, and `jq`.
set -euo pipefail

repo="${GITHUB_REPOSITORY:-PflanzenDex/PflanzenDex}"
root="$(git rev-parse --show-toplevel)"
mode="${1:-apply}"
# Fields GitHub adds or normalizes itself are ignored in the comparison.
normalize='{name,target,enforcement,conditions,bypass_actors,rules} | walk(if type == "array" then sort_by(tostring) else . end)'

live="$(gh api "repos/$repo/rulesets" --jq '.[] | "\(.name)\t\(.id)"')"
drift=0
for file in "$root"/.github/rulesets/*.json; do
  name="$(jq -r .name "$file")"
  id="$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' <<<"$live")"
  if [ "$mode" = "--check" ]; then
    if [ -z "$id" ]; then echo "rulesets: missing on GitHub: $name"; drift=1; continue; fi
    if ! diff <(jq -S "$normalize" "$file") <(gh api "repos/$repo/rulesets/$id" | jq -S "$normalize") >/dev/null; then
      echo "rulesets: drift in $name (file: ${file#"$root"/})"; drift=1
    fi
  elif [ -n "$id" ]; then
    gh api -X PUT "repos/$repo/rulesets/$id" --input "$file" --jq '"rulesets: updated \(.name)"'
  else
    gh api -X POST "repos/$repo/rulesets" --input "$file" --jq '"rulesets: created \(.name)"'
  fi
done
[ "$mode" != "--check" ] || { [ "$drift" = 0 ] && echo "rulesets: no drift"; exit "$drift"; }
