---
name: recap-and-learnings
description: Use when a task, review or incident is finished and something went wrong, surprised you or took a detour. Extracts the lesson and puts it where it prevents the next occurrence: a gate if it can be checked, a skill if it needs judgment, otherwise the pitfalls register (D-03).
---

# Recap and learnings

Goal: the same mistake does not happen twice, without growing prose nobody reads.

1. Recap in a few lines: what was planned, what happened, where time or correctness was lost (failed gate, review finding, wrong assumption, flaky test). Use facts: commit, test name, error text.
2. For each finding ask: what would have prevented it, and can a machine check that? Apply the promotion rule (D-03, `Docs/PRODUCT-SPECS/19-Development-Process-and-Automation.md`):
   - Checkable -> build or extend a gate (lint rule, test, check script in `app/scripts/`, CI step). Then the prose rule is deleted or replaced by a pointer to the gate.
   - Needs judgment, recurs in one kind of task -> add a step to the matching skill in `.agents/skills/`, or write a new skill (keep it short; the check script in `app/scripts/check-skills.mjs` validates it).
   - Recurring trap with a short explanation -> an entry in the pitfalls register (the spec names it Stolperfallen-Register; its folder is created by a separate change, so look in `Docs/` for it first and add the entry there; if it still does not exist, say so in the PR instead of creating a parallel place).
   - One-off -> no entry. Not every incident is a rule.
3. Write each entry as: symptom, cause, prevention, how to detect. Keep to five lines, in English.
4. If the lesson changes a principle, requirement or decision, change the spec in `Docs/PRODUCT-SPECS/` in the same PR (IDs are never renumbered) instead of only noting it elsewhere.
5. If a skill was followed and still led to the mistake, fix the skill, do not add a second one.
6. Report back: findings, where each was recorded (gate, skill, pitfall, none) and why. Propose changes to the maintainer; do not weaken a gate to make a task pass.

## Check

```bash
make skills-check
```

Expected: `check-skills: N skills, all complete and linked`; every new or changed skill passes, and the PR names where each lesson went.
