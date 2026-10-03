---
paths:
  - ".github/**"
  - "Makefile"
  - ".githooks/**"
  - "scripts/**"
---

# Rules for CI, Makefile and git hooks

- These files define what "done" means. Never weaken a gate (thresholds, exception lists, skipped steps, `continue-on-error`) to turn a red run green; ask a human first (US-QG-07).
- Local and CI run the same `make` targets (FR-QG-01). CI-only logic is limited to extra services (database, browser). Add a target to the `Makefile` first, then call it from the workflow.
- Untrusted input (PR titles, branch names, issue text, commit messages) never goes into `run:` via `${{ ... }}`; pass it through `env:` and quote the variable.
- Least privilege: set `permissions:` explicitly per workflow or job (default `contents: read`) and grant write scopes only where needed.
- Never use `--no-verify`, never change `core.hooksPath` by hand; `make hooks` installs the hooks.
- Scripts and workflow comments are English. `make workflows` (actionlint) must pass.
- Secrets live in GitHub secrets, never in files; gitleaks runs in `make secrets`.
