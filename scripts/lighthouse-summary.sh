#!/usr/bin/env bash
# Prints the median score per category of the Lighthouse runs in app/packages/web/.lighthouseci as a Markdown table (QG-U1, report only).
set -euo pipefail
dir="$(dirname "$0")/../app/packages/web/.lighthouseci"
ls "$dir"/run-*.json >/dev/null 2>&1 || { echo "no Lighthouse reports in $dir" >&2; exit 1; }
echo "### Lighthouse (mobile, median of runs; report only, no threshold yet, E-15)"
echo
echo "| Category | Score |"
echo "| --- | --- |"
jq -rs '[.[].categories | to_entries[] | {k: .key, v: .value.score}] | group_by(.k)[]
  | (map(.v) | sort) as $s | "| \(.[0].k) | \(($s[($s | length) / 2 | floor] * 100) | round) |"' "$dir"/run-*.json
