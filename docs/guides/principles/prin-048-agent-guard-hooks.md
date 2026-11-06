---
id: PRIN-048
title: Agent sessions cannot skip the gates or change gate files without a human
maturity: checked
spec: [US-QG-07, US-DEV-02]
---

## Why it is better

An agent that bypasses a check to make a run green defeats the gate. Hooks that refuse the commands and edits that would do so keep the gate in place during the session.

## How it is measured

Number of forbidden commands and gate-file edits that reach execution in an agent session. Target: 0. The forbidden set covers `--no-verify`, `gh pr merge`, pushes to `dev` or `main`, plain force pushes, changes of `core.hooksPath`, and release or tag commands.

## Checked by

`.claude/hooks/run.mjs`, `.claude/hooks/rules.mjs`, configured in `.claude/settings.json` (PreToolUse for Bash and for edits).

## Evidence

Tests in `.claude/hooks/rules.test.mjs`, run by `npm test`. The hooks run only in Claude Code: a human shell or another tool is not covered. CI and the rulesets repeat the checks that matter (D-02).
