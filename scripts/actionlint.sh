#!/usr/bin/env bash
# Workflow check: syntax, expressions, shell scripts (shellcheck if installed) and script injection in .github/workflows/.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
bin="$("$root/scripts/tool.sh" actionlint)"
cd "$root" && "$bin" && echo "actionlint: no findings in workflows"
