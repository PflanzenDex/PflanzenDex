---
id: PRIN-050
title: A feat or fix pull request adds a user-facing changelog entry or says why not
maturity: gated
spec: [QG-U3]
---

## Why it is better

The app shows users what changed. A feature or a fix that users never hear about is a change they cannot find; the entry is written where the change is made.

## How it is measured

Number of pull requests with the type `feat` or `fix` in the title that neither change the changelog file `app/packages/web/src/news/news.de.json` nor carry `[skip-changelog]` in title or body. Target: 0.

## Checked by

`app/tools/check/release/check-changelog.mjs`, `app/packages/web/src/news/news.de.json`.

## Gate

`make changelog-check` in the CI job `metadata` of `.github/workflows/ci.yml` (for pull requests that are not drafts); `ci-status` requires the job.

## Evidence

Tests in `app/tools/check/release/check-changelog.test.mjs`. The job reads the type from the pull request title, so the title format itself is checked by the commit-message entry (PRIN-009). Drafts are skipped until they are marked ready.
