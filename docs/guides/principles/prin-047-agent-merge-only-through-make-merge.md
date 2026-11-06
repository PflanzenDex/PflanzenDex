---
id: PRIN-047
title: Agents merge only into dev, with a green ci-status, a named story and no gate file
maturity: gated
spec: [US-DEV-05, FR-QG-02]
---

## Why it is better

Agents can open and review many pull requests. A guarded merge target keeps the conditions of the merge in one place, so an agent cannot merge into `main`, merge a gate change, or merge a story that is not written down.

## How it is measured

Number of agent merges that pass without one of the four conditions: the pull request is open, not a draft and targets `dev`; the newest `ci-status` run on the head commit is green; the pull request names a story or requirement that exists in `docs/specs/product/`; the pull request changes no gate file. Target: 0.

## Checked by

`app/tools/workflow/merge-pr.mjs`, `.claude/hooks/rules.mjs` (function `isGateFile`, the list of gate files).

## Gate

`make merge PR=<n>`, which runs `app/tools/workflow/merge-pr.mjs`. A failed condition is named and the merge is left to a human.

For the human review of the open gate PRs, `make gate-review` (US-QG-07) lists every open pull request into `dev` that changes a gate file: its gate files, the CI state on its head as it stands (never waited for), conflicts, age, and whether a limit, baseline or allowlist moved looser. A change it cannot prove is shown as "read it". The command is read-only and merges nothing; the human merge stays (ADR 0005).

## Evidence

Tests in `app/tools/workflow/merge-pr.test.mjs`. The gate-file list is a configuration of the hooks, so a change to it is itself a gate change. Human merges are not covered by this entry (ADR 0005).
