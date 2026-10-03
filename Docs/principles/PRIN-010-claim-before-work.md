---
id: PRIN-010
title: A story is claimed before work starts, so nobody builds it twice
maturity: checked
spec: [US-DEV-08, FR-DEV-09]
---

## Why it is better

LIC-01 and WAC-01 were once built twice in parallel, even under the same branch name. A claim (assignee, branch, draft PR) makes the owner of a story visible before the first line is written, so duplicate work is stopped at the start and not found in review.

## How it is measured

Number of stories with more than one assignee, live branch or open PR, and number of stories with a branch but no assignee. `make board` prints both as the flags `DOUBLE` and `NO-CLAIM`; the target is 0. Claims without a commit for `CLAIM_STALE_HOURS` (starting value 48, an assumption) are flagged `STALE`.

## Checked by

`app/scripts/claim.mjs`, `app/scripts/claim-check.mjs`, `app/scripts/board.mjs` and their tests (`app/scripts/claim.test.mjs`, `app/scripts/claim-check.test.mjs`, `app/scripts/board.test.mjs`). `make claim` refuses a second claim, `make worktree` and the pre-push hook (`.githooks/pre-push`) refuse a story that belongs to somebody else.

## Evidence

Not yet gated: no CI job requires a claim, and the pre-push hook can be skipped with `--no-verify` or `SKIP_CLAIM_CHECK=1`. The checks need `gh` and network; offline they only warn. The first real use of the tool is the evidence still missing. Becoming a gate would need a CI check that a PR's story is assigned to the PR author (open).
