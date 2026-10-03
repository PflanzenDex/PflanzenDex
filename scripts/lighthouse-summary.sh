#!/usr/bin/env bash
# Prints the representative (median) Lighthouse run of app/packages/web/.lighthouseci as a Markdown table (QG-U1, report only).
set -euo pipefail
dir="$(dirname "$0")/../app/packages/web/.lighthouseci"
test -f "$dir/manifest.json" || { echo "no Lighthouse manifest in $dir" >&2; exit 1; }
echo "### Lighthouse (mobile, median of runs; report only, no threshold yet, E-15)"
echo
echo "| Category | Score |"
echo "| --- | --- |"
jq -r '.[] | select(.isRepresentativeRun) | .summary | to_entries[]
  | "| \(.key) | \((.value * 100) | round) |"' "$dir/manifest.json"
