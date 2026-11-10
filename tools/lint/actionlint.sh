#!/usr/bin/env bash
# Workflow check: syntax, expressions, shell scripts (shellcheck) and script injection in .github/workflows/.
# Runs the image pinned by tag and digest, which ships shellcheck; CI runs this same script (FR-QG-01).
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
image="rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667"

# No Docker, no check: fail with the reason instead of running without shellcheck.
command -v docker >/dev/null 2>&1 || {
  echo "actionlint: docker is not installed; make workflows needs Docker (it runs actionlint with shellcheck in a pinned image). Install Docker and run make workflows again." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "actionlint: the Docker daemon is not reachable. Start Docker and make sure your user may use it (docker group), then run make workflows again." >&2
  exit 1
}

# Read-only mount: the image only reads the workflow files and leaves no files behind in the checkout.
docker run --rm --network none --mount "type=bind,source=$root,target=/repo,readonly" -w /repo "$image"
echo "actionlint: no findings in workflows"
