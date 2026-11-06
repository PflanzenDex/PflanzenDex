---
id: PRIN-035
title: Agent skills have a matching name, a trigger, existing paths and a make check
maturity: gated
spec: [US-DEV-04]
---

## Why it is better

A playbook without a check command cannot tell whether its result is right, and a playbook with a broken path sends the agent to a file that does not exist.

## How it is measured

Number of problems in the skills of `.agents/skills/`: name not equal to the folder, no description that says when to use the skill, repo paths that do not exist, no `## Check` section, or a check command that is not an existing `make` target. Target: 0.

## Checked by

`app/tools/check/docs/agents/check-skills.mjs`, skills in `.agents/skills/`.

## Gate

`make gates` (step `npm run skills`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. Locally: `make skills-check`.

## Evidence

Tests in `app/tools/check/docs/agents/check-skills.test.mjs`. Whether a skill is useful is not checked.
