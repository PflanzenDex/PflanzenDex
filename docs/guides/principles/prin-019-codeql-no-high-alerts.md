---
id: PRIN-019
title: CodeQL reports no high or critical security alert on dev and main
maturity: gated
spec: [QG-S3, E-16]
---

## Why it is better

CodeQL follows data flows across functions, which the lint rules of PRIN-018 do not. A high-severity alert on a branch that is about to be merged should stop the merge.

## How it is measured

Number of open CodeQL alerts of severity high or higher on `dev` and `main` (threshold `high_or_higher` in the rulesets). Target: 0. The workflow also runs weekly, so new queries find issues in unchanged code.

## Checked by

`.github/workflows/codeql.yml` (languages `javascript-typescript` and `actions`, query suite `security-extended`).

## Gate

The ruleset rule `code_scanning` in `.github/rulesets/dev-protection.json` and `.github/rulesets/main-protection.json`, applied with `tools/repo/rulesets-apply.sh`. Both rulesets are active on GitHub; read with `gh api` on 2026-11-06 they contain the `code_scanning` rule.

## Evidence

The CodeQL analysis job is not in `ci-status`; the blocking part is the ruleset, which GitHub enforces on the merge. A failed `CodeQL` or `analyze (<language>)` check on the head is also named by `make ci-wait` and refuses `make merge` (US-DEV-10). No CI job compares the live rulesets with the versioned files. Results appear under Security, Code scanning.
