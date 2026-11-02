#!/usr/bin/env bash
# Prints the median Lighthouse scores and metrics of the runs in app/packages/web/.lighthouseci against their limits as Markdown (QG-U1, FR-QG-09); --check fails past a limit.
# The logic and its tests live in app/tools/check/release/check-lighthouse-summary.mjs.
set -euo pipefail
exec node "$(dirname "$0")/../../app/tools/check/release/check-lighthouse-summary.mjs" "$@"
