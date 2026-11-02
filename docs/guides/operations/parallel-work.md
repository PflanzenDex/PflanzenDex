# Working in parallel without collisions (US-DEV-08)

Background: two sessions working in the same folder once produced duplicate spec file numbers. Hence the rule: one task, one branch, one working directory.

## Claim a story first (no duplicate work)

A second collision type is two people building the same story (LIC-01 and WAC-01 were built twice, once even under the identical branch name `feat/wac-01-messung`). Hence: nobody starts a story without claiming it.

```bash
make claim ISSUE=<n>     # claim the issue, branch and draft PR
make board               # who works on what (optional: RELEASE="R0 Fundament")
```

`make claim` (`app/tools/workflow/claim/claim.mjs`) refuses with exit 1 and names the finding when

- the issue has an assignee,
- a PR (open or merged) closes the issue (`Closes #n` in the body), or an open PR carries the story ID in title or branch (a merged PR that only mentions the ID does not count: it may be one part of a bigger story),
- a branch on `origin` carries the story ID.

Before any write a preflight checks that `node_modules` exists and matches `package-lock.json` (`make setup` records the lock hash in `node_modules/.setup-lock-hash`; `app/tools/check/supply/check-deps.mjs`; hooks and `make gates` run the same check, so a pull that changed the lock file stops with "run make setup") and that `origin/dev` has a `Makefile` (no ancient checkout). Otherwise it pushes the branch with one empty commit (made without touching your working tree), assigns you, sets the project status "In Progress" (field and option ids are read at run time) and opens a draft PR against `dev` whose text has a `## Handoff` section (task, done, missing, verification, next steps). Keep that section current; whoever takes over reads it first. The PR title must be completed by the author (`gh api -X PATCH` edits it; `gh pr edit` fails with Projects classic). If another person claimed the issue at the same moment, the later claim steps back and deletes its branch. The claim is atomic: if a step fails, the steps already done are undone (branch deleted, assignee removed, status back to "Todo"); an issue assigned to you without a branch or PR (half claim of an older run) is continued by a re-run.

**Project status after the claim:** `.github/workflows/project-status.yml` moves it on PR events (merged into `dev` → On dev, closed unmerged → Todo, release PR merged into `main` → Done; rules in `app/tools/workflow/actions/project-status/project-status-lib.mjs`). Only `Closes #n` in the PR body links a PR to an issue. `make status-check` reports drift and missing priorities. The workflow needs a GitHub App (repository variable `PROJECT_APP_ID`, secret `PROJECT_APP_PRIVATE_KEY`, organization permission "Projects: read and write", installed on this repository); without it the job fails and the status stays as it is.

**The board tracks, the issue describes:** release, type and epic are the project fields Release, Typ and Epic, not milestones or labels. `make board` lists the open items whose Typ is Story or Enabler for one Release (default: the first release in board order with open work). The issue templates add new issues to the board; set Typ, Release, Epic and Priority there.

**Priority:** `make claim` prints a warning when the claimed issue has no project priority, and `make board` flags such items `NO-PRIO` (both only warn). The rule is in `CLAUDE.md` ("Priority of tickets").

**Branch naming rule:** `<type>/<epic>-<nn>-<slug>`, e.g. `feat/wac-01-messung`. The story ID is written without `US-`/`FR-`, the slug is up to four words of the issue title, lower case, at most 30 characters. Type: `fix` for the board type (field Typ) Bug, `chore` for Enabler, otherwise `feat`; the labels `bug` / `enabler` count only for an issue that is not on the board. Issues without a story ID use `issue-<n>`, e.g. `chore/issue-243-claim-check`. Matching is by this key, so `feat/us-wac-01-x` and `feat/wac-01-y` count as the same story.

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

### Memory caps of the local containers

Every worktree starts its own test database, so the local containers are capped (#1084, starting values, assumption): the test database 512 MB (`make db-up`, override with `DB_MEMORY=1g`), Keycloak 768 MB with a 384 MB JVM heap and Mailpit 128 MB (`app/config/dev/compose.yaml`, override with `KC_MEMORY`, `KC_JAVA_HEAP`, `MAILPIT_MEMORY` in `app/config/dev/.env`). An existing container keeps its old settings: run `make db-down` or `make auth-down` once to recreate it. The caps are local only. CI brings its own database service, and production has its own limits in `app/config/deploy/docker-compose.yml`. `app/tools/dev/tests/dev-memory-caps.test.mjs` fails if a deploy file or deploy workflow loads a dev compose file or uses one of these variables.

## Owners and number assignment

- `.github/CODEOWNERS` names an owner per folder; changes to it require review.
- `make gates` includes `check-specs`: duplicate file numbers in `docs/specs/product/` and IDs defined twice (`US-/FR-/DM-/E-`) fail the run. Whoever adds a number checks the highest free number on the current `origin/dev`; on a conflict the later PR rebases and renumbers (IDs of existing entries are never renumbered).

**Migration numbers:** `make migration NAME=<module>_<short_name>` creates the file with the next number that is free on `origin/dev`, in every open PR branch and in numbers reserved in a PR Handoff (one `gh pr list` call, `git ls-tree` per branch). `RESERVE_MIGRATION=1 make claim ISSUE=<n>` writes the next free number into the draft PR's Handoff (`- **Migration number:** 0067`); `make migration` on that branch uses it. The gate `npm run migration-numbers` (part of `make gates`, `app/tools/workflow/claim/migration/`) fails on two migrations with the same number and on a new migration whose number is not above the highest on `origin/dev`; fix: merge `origin/dev`, rename only your own new file with `make migration`. Applied migrations are never renumbered.

## Rules for agents

- Do not commit without being asked; do not change other people's files without a task.
- Touch shared files (Makefile, `package.json`) as little as possible; put your own logic into your own scripts.
- Report before writing if a file has changed since it was read.

## Short output for agents (US-DEV-12)

Long commands print hundreds of lines that cost tokens. Run them through the wrapper; it writes the full output to a log file (default `.cache/agent-logs/run-<time>.log`, ignored by git) and prints the path:

```bash
node app/tools/dev/agent/quiet.mjs -- make ci                 # success: one line; failure: failure lines + last 15 lines
node app/tools/dev/agent/quiet.mjs --tail 30 --log /tmp/gates.log -- make gates
node app/tools/dev/agent/pr-status.mjs 775                    # "N green, M open, K red" plus the names of non-green jobs
```

The exit code of the command is passed through. The wrapper only shortens what is printed; read the log file when the digest is not enough. Agent rule files (`AGENTS.md`) are gate files: a human adds the reference there.

## Open

A test lock for shared resources (pattern `with-test-lock.cjs`) only makes sense now that the test database (TE-02, PR #186) exists. Until then, unique ports and database names per worktree prevent collisions (the alternative the criterion allows). TE-02 and TE-03 have to read these variables instead of fixed ports.
