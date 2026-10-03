#!/usr/bin/env bash
# Secret scan (QG-S1): gitleaks over the full git history. Same command locally and in CI (FR-QG-01).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
bin="$("$root/scripts/tool.sh" gitleaks)"
# Full history: a secret that was ever committed stays a finding until it is revoked and explicitly ignored with a reason.
"$bin" git "$root" --redact --no-banner --log-level warn || {
  echo "QG-S1: secret found. Revoke it and remove it from the code; exceptions only with a reason in .gitleaksignore." >&2
  exit 1
}
echo "QG-S1: no secrets in the history"
