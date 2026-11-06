---
id: PRIN-044
title: Releases come only from a green main, production deploys only from a stable release tag
maturity: gated
spec: [FR-QG-14, E-14, QG-R1]
---

## Why it is better

A release that is not built from a tested commit, or a production deploy of an unreleased build, ships what nobody checked. Limiting both to tested commits keeps the production version traceable.

## How it is measured

Number of releases created from a commit without a successful CI run on `main`, and number of production deploys from a commit that is not a stable tag `vX.Y.Z` on `main`. Target: 0 for both; the workflows refuse the second case.

## Checked by

`app/config/project/release.config.js`, tests in `app/tools/check/release/release-config.test.mjs`.

## Gate

`.github/workflows/release.yml` runs semantic-release only after a successful `CI` run of a push to `main`; `.github/workflows/deploy.yml` is started by hand and refuses `prod` unless the commit is a stable release tag on `main`.

## Evidence

The release workflow checks the conclusion of the CI run it follows; the deploy workflow checks the tag and the branch with its own script. Deploys are started by hand (E-14), so the refusal is the only automatic check there.
