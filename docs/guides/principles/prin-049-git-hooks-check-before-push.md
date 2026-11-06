---
id: PRIN-049
title: Commit messages, staged files and pushes are checked locally before they reach CI
maturity: checked
spec: [US-QG-01, US-DEV-02]
---

## Why it is better

A failure found before the push costs seconds; the same failure found by CI costs a run and a round trip. The hooks give the fast checks first, and CI repeats all of them.

## How it is measured

Number of commits whose message fails QG-C1, of commits that carry unformatted or lint-failing staged files, and of pushes that fail `make gates`. Target: 0 at the time of the commit or push, measured by the hook's exit code.

## Checked by

`.githooks/commit-msg` (commitlint), `.githooks/pre-commit` (lint-staged: Prettier and ESLint on staged files), `.githooks/pre-push` (`make gates`), `.githooks/_lib.sh`; enabled by `make hooks`.

## Evidence

The hooks run only where `core.hooksPath` points to `.githooks`, which `make setup` sets. `--no-verify` skips them; agents may not use it (PRIN-048), and CI repeats every check (PRIN-046). The commit message rule is PRIN-009.
