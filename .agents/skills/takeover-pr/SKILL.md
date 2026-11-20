---
name: takeover-pr
description: Use when you take over another contributor's (or an earlier lead's) pull request: the owner asked you to, or the PR is a claim only and stale. Covers the worktree on their branch, the independent pr-reviewer verdict, the Handoff's "Missing" list, the PR body (AI involvement, Refs or Closes) and the fix-plan fields (US-DEV-08, issue 2373).
---

# Take over a pull request

Goal: finish someone else's PR without losing their work, their history or their credit. These are the steps used on 2026-11-20 for #2338, #2340, #2341, #2347, #2348 and #1906.

## When

- The owner asked you to take the PR over, or
- the PR is a claim only (draft, nothing built) and stale: `make board` marks it `STALE` (no commit for `CLAIM_STALE_HOURS`, starting value 48 hours). Otherwise ask the assignee first (`docs/guides/operations/parallel-work.md`).

## Steps

1. **Worktree on their branch:** `SKIP_CLAIM_CHECK=1 make worktree BRANCH=<their branch>` (the claim check would refuse a story assigned to someone else). Assign the issue to yourself too, next to the original assignee: `gh issue edit <n> --add-assignee @me`. Do not run `make claim` again.
2. **Never rewrite their history:** no force push, no rebase of their branch. Bring it up to date with `git merge origin/dev` and push normally.
3. **Independent verdict first:** start ONE `pr-reviewer` subagent (`.claude/agents/pr-reviewer.md`) with the PR and the worktree, before you read their diff with your own conclusion in mind. It answers MERGE, MERGE AFTER FIX or DO NOT MERGE. Fix what it names (through an `implementer`, or yourself for docs), then review the new head as for your own PR (`/code-review`, skill `add-epic-feature` step 12).
4. **Check the Handoff against the issue:** read the issue and the Handoff's "Missing" list. Every point of the issue's Expected or Done must be built or named as missing; a "Missing" item can be stale or wrong in both directions.
5. **Check gate-file claims yourself:** run `isGateFile` from `.claude/hooks/rules.mjs` over the changed files. A Handoff that says "owner-merge" can be wrong, for example design-system snapshots are no gate files; one that says "no gate files" can be wrong too. A real gate file means `make merge` refuses: stop and report "owner-merge".
6. **PR body:** keep the original author's part of "AI involvement" and add a line for the takeover (who, which model, which review level, which findings fixed). Update the Handoff to the current state. Use `Refs #n` while the PR is a partial step of the issue and `Closes #n` only when it finishes the issue: only `Closes` moves the board to On dev and closes the issue on release.
7. **Red CI:** start ONE `ci-triager` subagent (`.claude/agents/ci-triager.md`) with the PR and head sha before you read job logs yourself; it reruns a flake once and names a real cause with file and line. A failure that comes from newer `dev` is fixed by merging `origin/dev` in, never by a rebase.
8. **Fix plan:** when the PR implements a fix (FX-nn) of the design review, write `in_progress_<date>` (e.g. `in_progress_2026-11-20`) on `fixes/FX-nn` of the fix-plan artifact when you take it over, and `merged: {pr, sha, at, note}` after `make merge`, both with `ArtifactData`, pinned to the version you read. Never set `done`: that needs the check on the four devices.
9. Then as for your own PR: `make pr PR=<n>`, wait for `ci-status`, `make merge PR=<n>`, clean up the worktree and the local branch.

## Check

```bash
make skills-check
```

Expected: `check-skills: N skills, all complete and linked`. For the takeover itself: the PR has the `pr-reviewer` verdict and its fixes in "AI involvement", the original author's part is kept, and `git log origin/<branch>` shows no rewritten commits of theirs.
