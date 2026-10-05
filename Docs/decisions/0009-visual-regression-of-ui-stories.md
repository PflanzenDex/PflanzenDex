# 0009 · Visual regression of the `components/ui` stories runs on Playwright screenshots in a pinned container

- **Status:** accepted (2026-10-05, project owner; option 1 of issue 346)
- **Refines:** QG-U5 (`Docs/PRODUCT-SPECS/18-Architecture-and-Quality-Gates.md`), US-QS-07, ADR 0007 (component catalog)

## Context

The conformance run (QG-U5) checks axe, touch targets and focus, but not how a primitive looks. A padding that moves by 4 px passes every one of those checks. Visual regression needs a rendering environment that is identical on a developer laptop and in CI, and a place for the baseline images.

## Decision

- **Playwright screenshots, no hosted service.** Nothing leaves the repo, there is no cost and no extra dependency (the alternative, Chromatic and similar, would send the catalog to a third party).
- **Scope:** the stories of `web/src/components/ui` only, 360 px wide, light and dark, full page. No page-level snapshots (they would carry data and change with every feature).
- **Baselines in git** in `app/packages/web/.storybook/snapshots/<story-id>--<light|dark>.png` (about 90 images, below 1 MB). They contain only component demos, no personal data.
- **Determinism:** the catalog is built on the host, but rendered inside the container `mcr.microsoft.com/playwright:v<installed playwright version>-noble`, locally and in CI. Same browser build, same fonts. Animations and the caret are off, fonts are awaited and the DOM must be quiet for 250 ms before the picture is taken. Tolerance: 0.1 % of the pixels (anti-aliasing noise). No retries: a screenshot that fails for a non-code reason is quarantined with an issue, never retried silently.
- **Update by hand only:** `make ds-snapshots` rewrites the baselines (needs Docker). CI never writes baselines. `make ds-snapshots-check` compares and also fails when a story has no baseline or a baseline has no story (stale), and runs the self-test with a fixture story (identical runs, a 4 px padding change fails and writes a diff image). The CI job `ds-snapshots` feeds `ci-status` and attaches the diff images as the artifact `ds-snapshots-diff` on failure.

## Update workflow

1. A component changed on purpose: run `make ds-snapshots`, look at the changed images in the diff of the PR, commit them with the change.
2. A Playwright upgrade (Renovate) changes the image tag and with it the pictures: the PR regenerates the baselines the same way.
3. A change that restyles many primitives (for example retiring the legacy CSS, issue 347) regenerates the baselines in its own PR, after the change itself is merged.

## Consequences

- Linux with Docker is needed to update baselines (macOS and Windows work through Docker too, because the container renders).
- Every intended visual change shows up as image changes in the PR, which is the point.
- The check costs about one minute in CI (catalog build plus 90 screenshots).
