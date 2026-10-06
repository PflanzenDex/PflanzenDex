#!/usr/bin/env bash
# Prints the median Lighthouse scores and phone-relevant metrics of the runs in app/packages/web/.lighthouseci as Markdown (QG-U1, report only).
# The logic and its tests live in app/tools/check/release/check-lighthouse-summary.mjs.
set -euo pipefail
exec node "$(dirname "$0")/../app/tools/check/release/check-lighthouse-summary.mjs" "$@"
