#!/usr/bin/env bash
# Lighthouse on the signed-in screens /today and /collection (FR-QG-09, issue 1251): mobile, median of 3 runs each, report only.
# Writes app/.cache/lighthouse-signed (JSON, summary.md, logs; LIGHTHOUSE_SIGNED_OUT overrides). Exits 1 only when a
# measurement could not run. The logic: lighthouse-signed-run.mjs (pure parts and tests: lighthouse-signed.mjs).
set -euo pipefail
exec node "$(dirname "$0")/lighthouse-signed-run.mjs" "$@"
