---
id: PRIN-050
title: A feat or fix pull request adds a user-facing changelog entry or says why not
maturity: gated
spec: [QG-U3]
---

## Why it is better

The app shows users what changed. A feature or a fix that users never hear about is a change they cannot find; the entry is written where the change is made.

## How it is measured

Number of pull requests with the type `feat` or `fix` in the title that add no new fragment file in `app/packages/web/src/news/unreleased/` with a non-empty `line` and carry no `[skip-changelog]` in title or body. Target: 0.

## Checked by

`app/tools/check/release/check-changelog.mjs`, the fragment folder `app/packages/web/src/news/unreleased/`, the shared rules `app/packages/web/src/app/destinations/account-area/whats-new/news-lines.mjs`.

## Gate

`make changelog-check` in the CI job `metadata` of `.github/workflows/ci.yml` (for pull requests that are not drafts); `ci-status` requires the job.

## Evidence

Tests in `app/tools/check/release/check-changelog.test.mjs` (QG-U3, US-DEV-06), the release rules in `news-lines.test.ts` and `tools/repo/news-release.test.mjs`. The job reads the type from the pull request title, so the title format itself is checked by the commit-message entry (PRIN-009). Drafts are skipped until they are marked ready.
