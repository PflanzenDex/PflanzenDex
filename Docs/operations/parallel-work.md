# Working in parallel without collisions (US-DEV-08)

Background: two sessions working in the same folder once produced duplicate spec file numbers. Hence the rule: one task, one branch, one working directory.

## Claim a story first (no duplicate work)

A second collision type is two people building the same story (LIC-01 and WAC-01 were built twice, once even under the identical branch name `feat/wac-01-messung`). Hence: nobody starts a story without claiming it.

```bash
make claim ISSUE=<n>     # claim the issue, branch and draft PR
make board               # who works on what (optional: MILESTONE="R0 Fundament")
```

`make claim` (`app/tools/workflow/claim/claim.mjs`) refuses with exit 1 and names the finding when

- the issue has an assignee,
- a PR (open or merged) closes the issue (`Closes #n` in the body), or an open PR carries the story ID in title or branch (a merged PR that only mentions the ID does not count: it may be one part of a bigger story),
- a branch on `origin` carries the story ID.

Before any write a preflight checks that `node_modules` exists and matches `package-lock.json` (`make setup` records the lock hash in `node_modules/.setup-lock-hash`; `app/tools/check/supply/check-deps.mjs`; hooks and `make gates` run the same check, so a pull that changed the lock file stops with "run make setup") and that `origin/dev` has a `Makefile` (no ancient checkout). Otherwise it pushes the branch with one empty commit (made without touching your working tree), assigns you, sets the project status "In Progress" (field and option ids are read at run time) and opens a draft PR against `dev` whose text has a `## Handoff` section (task, done, missing, verification, next steps). Keep that section current; whoever takes over reads it first. The PR title must be completed by the author (`gh api -X PATCH` edits it; `gh pr edit` fails with Projects classic). If another person claimed the issue at the same moment, the later claim steps back and deletes its branch. The claim is atomic: if a step fails, the steps already done are undone (branch deleted, assignee removed, status back to "Todo"); an issue assigned to you without a branch or PR (half claim of an older run) is continued by a re-run.

**Project status after the claim:** `.github/workflows/project-status.yml` moves it on PR events (merged into `dev` → On dev, closed unmerged → Todo, release PR merged into `main` → Done; rules in `app/tools/workflow/actions/project-status/project-status-lib.mjs`). Only `Closes #n` in the PR body links a PR to an issue. `make status-check` reports drift and missing priorities. The workflow needs a GitHub App (repository variable `PROJECT_APP_ID`, secret `PROJECT_APP_PRIVATE_KEY`, organization permission "Projects: read and write", installed on this repository); without it the job fails and the status stays as it is.

**Priority:** `make claim` prints a warning when the claimed issue has no project priority, and `make board` flags such items `NO-PRIO` (both only warn). The rule is in `CLAUDE.md` ("Priority of tickets").

**Branch naming rule:** `<type>/<epic>-<nn>-<slug>`, e.g. `feat/wac-01-messung`. The story ID is written without `US-`/`FR-`, the slug is up to four words of the issue title, lower case, at most 30 characters. Type: `fix` for label `bug`, `chore` for label `enabler`, otherwise `feat`. Issues without a story ID use `issue-<n>`, e.g. `chore/issue-243-claim-check`. Matching is by this key, so `feat/us-wac-01-x` and `feat/wac-01-y` count as the same story.

Exceptions, all explicit:

- `ALLOW_PRIOR_WORK=1 make claim ISSUE=<n>` waives merged PRs only (follow-up work on a story). Assignee, open PR and live branch are never waived.
- `SKIP_CLAIM_CHECK=1` skips the claim check of `make worktree`. Use it only for branches that are not a story.
- To take over a story, ask the assignee or unassign them on the issue; `make board` marks claims without a commit for `CLAIM_STALE_HOURS` hours (starting value 48, an assumption) as `STALE`.

`make board` flags: `STALE` (see above), `DOUBLE` (more than one assignee, live branch or open PR for one story) and `NO-CLAIM` (a branch or PR exists, but nobody is assigned). Branches whose PR is merged or closed do not count as live.

Limits: the check needs `gh` and network; offline it warns and lets go. It is a local check (hook, make target), not a CI gate, so `--no-verify` bypasses it (PRIN-010, maturity `checked`).

## Start a new task

```bash
make worktree BRANCH=feat/<task>
```

`make worktree` first runs the claim check (`app/tools/workflow/claim/claim-check.mjs`): a branch with a story ID is refused when the story belongs to somebody else or has not been claimed (`make claim` first). If the branch already exists on `origin` (made by `make claim`), the worktree continues it. There is no check on push: anyone with access may push to a branch.

This calls `tools/repo/worktree-new.sh`: it fetches `origin/dev`, creates the branch and a worktree under `.worktrees/<branch>/` (slashes become dashes) and writes `.env.worktree`. Then change into that directory and run `make setup` there. Two sessions never write into the same directory; `.worktrees/` and `.env.worktree` are ignored by git.

## Own ports and database per worktree

`app/tools/workflow/worktree-env.mjs` derives these deterministically from the branch name:

| Variable                                                | Meaning                                            |
| ------------------------------------------------------- | -------------------------------------------------- |
| `PFLANZENDEX_TEST_DB_PORT`                              | test database port (starting range 54400 to 54899) |
| `PFLANZENDEX_TEST_DB_NAME`                              | database name `pflanzendex_<branch>_<hash>`        |
| `PFLANZENDEX_DEV_API_PORT` / `PFLANZENDEX_DEV_WEB_PORT` | dev servers (ranges 54900 to 55899)                |

The ranges are an assumption (starting values). With 500 slots per service collisions are rare but possible (hash). The fixed port 54329 is reserved for the main checkout. To use the variables, load them with `set -a; . ./.env.worktree; set +a`. Sign-in on a worktree port needs one more step after `make auth-up`: `cd app && node tools/keycloak/web-port.mjs` allows that port as redirect origin of the Keycloak web client (the realm export only knows 5173; Keycloak has no wildcard for ports).

## Owners and number assignment

- `.github/CODEOWNERS` names an owner per folder; changes to it require review.
- `make gates` includes `check-specs`: duplicate file numbers in `Docs/PRODUCT-SPECS/` and IDs defined twice (`US-/FR-/DM-/E-`) fail the run. Whoever adds a number checks the highest free number on the current `origin/dev`; on a conflict the later PR rebases and renumbers (IDs of existing entries are never renumbered).

## Rules for agents

- Do not commit without being asked; do not change other people's files without a task.
- Touch shared files (Makefile, `package.json`) as little as possible; put your own logic into your own scripts.
- Report before writing if a file has changed since it was read.

## Open

A test lock for shared resources (pattern `with-test-lock.cjs`) only makes sense now that the test database (TE-02, PR #186) exists. Until then, unique ports and database names per worktree prevent collisions (the alternative the criterion allows). TE-02 and TE-03 have to read these variables instead of fixed ports.
