---
id: PRIN-045
title: Version tags come only from the release workflow
maturity: checked
spec: [FR-DEV-05]
---

## Why it is better

A version set by hand breaks the link between a version and the commits that produced it, and the changelog then describes the wrong thing.

## How it is measured

Number of `v*` tags that are not SemVer, do not point at a commit on `main`, or have no GitHub release created by the release workflow (`github-actions[bot]`); and number of `package.json` files with a hand-written version field. Target: 0.

## Checked by

`app/tools/check/release/check-release-tags.mjs`, tag ruleset `.github/rulesets/release-tags.json` (blocks changing and deleting tags).

## Evidence

The workflow `.github/workflows/release-tag-check.yml` runs the check on every pushed tag and fails the run; the nightly suite runs `make release-tags-check`. Tests in `app/tools/check/release/check-release-tags.test.mjs`. Creating a tag cannot be blocked, so a wrong tag is detected after the push (ADR 0002).
