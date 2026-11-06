---
id: PRIN-009
title: Commit messages follow Conventional Commits
maturity: gated
spec: [FR-QG-14, E-13, QG-C1]
---

## Why it is better

Releases, changelog and the spec status derive from the commit type and scope; a free-form message breaks that.

## How it is measured

Number of pull request titles that fail commitlint (the squash merge turns the title into the commit message on `dev` and `main`) and number of local commits whose message fails the commit-msg hook. Target: 0. The types and scopes are fixed in `app/config/project/commitlint.config.js`.

## Checked by

`app/config/project/commitlint.config.js`, `.githooks/commit-msg` (local commit check).

## Gate

`make commitlint` with the pull request title, run by the CI job `metadata` in `.github/workflows/ci.yml` for pull requests that are not drafts; `ci-status` requires the job.

## Evidence

The blocking check covers the pull request title, which is what lands on `dev` and `main`. Commits inside a pull request are checked only by the local hook, which `--no-verify` skips (not allowed for agents, PRIN-048).
