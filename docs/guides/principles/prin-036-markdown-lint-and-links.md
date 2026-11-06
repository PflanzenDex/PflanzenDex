---
id: PRIN-036
title: Markdown is linted and relative links resolve
maturity: gated
spec: [QG-U2, FR-QG-03]
---

## Why it is better

The docs are the first place a reader looks. A dead relative link or a broken Markdown structure is found in review only by chance.

## How it is measured

Number of markdownlint-cli2 findings in `docs/**/*.md` and `CLAUDE.md` (configuration `.markdownlint-cli2.jsonc`) and number of relative links that do not resolve. Target: 0 for both.

The link check starts at the repository root and reads every Markdown file below it: `docs/`, the root `*.md` files (`CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`) and `app/`. It does not read dependencies (`node_modules`), hidden entries (`.git`, `.worktrees`, `.github`, `.claude`, `.agents`, caches), build and test output (`dist`, `playwright-report`, `test-results`, `one-screen-report`, `a11y-routes-report`, and `coverage` directly under `app/` or `app/packages/<package>/`), the dated records `docs/records/spikes/` and `docs/records/test-logs/`, `docs/guides/roadmap.md` or `app/**/CHANGELOG.md`. Symbolic links are not followed. A link resolves when its target file or folder exists.

## Checked by

`app/tools/check/docs/check-links.mjs`, `.markdownlint-cli2.jsonc`.

## Gate

`make gates` (step `npm run docs`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`); a pull request that changes only documentation runs it in the job `docs-gates` (`make ci-docs`) instead, and `ci-status` requires both. Locally: `make docs-check`.

## Evidence

Tests in `app/tools/check/docs/check-links.test.mjs` (US-QG-02 and US-QG-04): a broken relative link in `docs/` fails the check and a valid one passes; broken links planted in a copy of the real `docs/` and root Markdown fail it; the real run reports the files of `docs/` and the root; dependency, worktree, build-output and record folders are not read; symbolic links are not followed. External URLs are not checked, nor anchors (`#section`) and reference-style links (`[text]: target`).

Measured on 2026-11-06 with the fix of US-QG-02 (#1459): the check reads 154 Markdown files from the repository root in about 0.1 s and finds 0 broken links. Before the fix it started at `app/`, read 4 files and never checked `docs/`, `CLAUDE.md`, `AGENTS.md` or `README.md`. Markdownlint still covers only `docs/**/*.md` and `CLAUDE.md`.
