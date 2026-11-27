# Working in parallel without collisions (US-DEV-08)

Background: two sessions working in the same folder once produced duplicate spec file numbers. Hence the rule: one task, one branch, one working directory.

## Claim a story first (no duplicate work)

A second collision type is two people building the same story (LIC-01 and WAC-01 were built twice, once even under the identical branch name `feat/wac-01-messung`). Hence: nobody starts a story without claiming it.

```bash
make claim ISSUE=<n>     # claim the issue, branch and draft PR
make board               # who works on what (optional: RELEASE="R0 Fundament")
```

A bot cannot be an assignee. When the agent runs as the GitHub App `pflanzendex-agent[bot]`, set `PFLANZENDEX_CLAIM_ASSIGNEE` to the login of the responsible human. `make claim` then assigns that human and names them in the Handoff, and the bot opens the draft PR. Without the variable, `make claim` refuses before it writes anything. `make worktree` counts an assignee that is the human or the bot as yours (US-DEV-08, issue 2556).

`make claim` (`app/tools/workflow/claim/claim.mjs`) refuses with exit 1 and names the finding when

- the issue has an assignee,
- an open PR links the issue: its body names it (`Closes #n` or `Refs #n`), or its branch carries the issue number (`issue-<n>`),
- a merged PR closes the issue (`Closes #n` in the body); a merged PR that only refers to it (`Refs #n`) is printed as a note, see below,
- a branch on `origin` carries the issue number (`issue-<n>`).

Two details of that check. A PR links only through its body or its branch, never through its title: many issues share one story ID (US-QS-32 sits on several issues), so an open PR of another issue never blocks the claim. A bare `#<n>` mention refuses nothing, and a `#<n>` with another number (`#<n>0`) matches nothing. A merged PR whose body only refers to the issue (`Refs #<n>`, `References #<n>`) is not a refusal: `make claim` prints `claim: note: PR #… (merged) refers to it (Refs #<n>): …` and goes on.

Before any write a preflight checks that `node_modules` exists and matches `package-lock.json` (`make setup` records the lock hash in `node_modules/.setup-lock-hash`; `app/tools/check/delivery/supply/check-deps.mjs`; hooks and `make gates` run the same check, so a pull that changed the lock file stops with "run make setup") and that `origin/dev` has a `Makefile` (no ancient checkout). Otherwise it pushes the branch with one empty commit (made without touching your working tree), assigns you, sets the project status "In Progress" (two GraphQL writes; the field and option ids are read at run time, and the board item is added only when the issue is not on the board yet) and opens a draft PR against `dev` whose text has a `## Handoff` section (task, state, done, missing, open decisions, owner decisions, verification, next steps, worktree) and an empty "## Lessons" placeholder that `make pr` refuses until it is filled in (US-DEV-05). Keep that section current; whoever takes over reads it first. The PR title must be completed by the author (`gh api -X PATCH` edits it; `gh pr edit` fails with Projects classic). If another person claimed the issue at the same moment, the later claim steps back and deletes its branch. The claim is atomic: if a step fails, the steps already done are undone (status back to "Todo", assignee removed, branch deleted). Each undo step is tried three times. The branch is deleted only while origin still points at the claim commit, so a branch somebody else pushed under the same name is never deleted. An undo that still fails prints its command, to run by hand (P-10). An undo is registered before its write, so an answer lost on the way (a timeout) is undone too. An issue assigned to you without a branch or PR (half claim of an older run) is continued by a re-run.

Every GitHub or git call of `make claim` has a time limit, 60 seconds by default (`CLAIM_TIMEOUT_S=<seconds>` changes it; an assumption, starting value). The git push of the claim and of its undo has a limit of its own, 300 seconds by default (`CLAIM_PUSH_TIMEOUT_S=<seconds>` changes it; an assumption, starting value), because the pre-push hook runs `make gates`. A call that does not answer ends its process group, so no gate run is left behind, and the claim ends with a message that names it; the undo runs. Each step is announced before it runs (`claim: pushing origin/…`, `claim: assigning #…`), so a slow network is visible while it happens. The reads that do not depend on each other run at once, and the branches are read from the remote-tracking refs that the fetch has just updated (no extra call; `git ls-remote` is asked only when the fetch refspec is narrow).

**PR title:** the claim writes `<type>(<scope>): <subject> (<story ID>)` from the issue title. Check it against the Conventional Commit rule (at most 100 characters, an allowed scope from `app/config/project/commitlint.config.js`) and set it with `make pr-text TITLE=…` before `make pr`.

## The GraphQL budget (shared account, #1412)

All sessions share one account and 5,000 GraphQL points an hour; a failed call returns HTTP 200 with the error in the body. The tools keep the board calls few and survive the limit:

- Repository, issue, pull request and assignee reads and writes use REST, which has its own budget and spends no points. `make claim` (except the board status), `make worktree`, `make issue` (creating the issue) and the draft PR keep working when GraphQL is used up.
- The board is GraphQL. Measured with GitHub's `rateLimit.cost` on 2026-11-05: one issue's board item 1 point, the project's field ids 1 point, one page of 100 board items 1 point (the whole board, 704 items, about 8 points). `gh project item-list` and `gh project field-list` cost about 100 points each, so the tools do not call them (PF-005).
- `make claim` without the board warns, keeps the claim and says that the project status must be set by hand (P-10).
- `make issue` creates the issue even when the board cannot be reached. Its output names the board fields that are not set. CI sets Typ, Epic and an empty Status once the labels are valid (`issue-check.yml`, App token); CI does not set Priority or Release, so Priority is set by hand on the board; `make issue` sets the Release by its rule, and `RELEASE=` overrides it.
- `make pr` reads the PR and runs the title and changelog checks over REST before anything is pushed, pushes the branch, waits until GitHub shows the head, and only then marks the PR ready with GraphQL, which has no REST route (issue 1608). On a rate limit it reads the reset from the failing response's `X-RateLimit-Reset` header, waits for it if that is within five minutes, tries at most three times, and otherwise exits 75 and says when to run `make pr` again. Once the checks passed, the branch is pushed in every case.

**Project status after the claim:** `.github/workflows/project-status.yml` moves it on PR events (merged into `dev` → On dev, closed unmerged → Todo, release PR merged into `main` → Done; rules in `app/tools/workflow/actions/project-status/project-status-lib.mjs`). Only `Closes #n` in the PR body moves the board (On dev on merge, Todo on a closed PR) and closes the issue on release. The draft PR that `make claim` opens starts with `Refs #n` (a partial step); when the PR finishes the story, its first line becomes `Closes #n`. `make pr` prints a note when the body only refers to the issue, and never refuses for it. `make status-check` reports drift, missing priorities and open items without a Status; an open PR that names the issue with `Refs #n` counts as open there, so a claimed item with its draft is not reported. The workflow needs a GitHub App (repository variable `PROJECT_APP_ID`, secret `PROJECT_APP_PRIVATE_KEY`, organization permission "Projects: read and write", installed on this repository); without it the job fails and the status stays as it is. A failed status write at claim time is only a warning, so the status can stay empty while the claim holds; set it by hand with `gh project item-edit`.

**The board tracks, the issue describes:** release, type and epic are the project fields Release, Typ and Epic, not milestones or labels. `make board` lists the open items whose Typ is Story or Enabler for one Release (default: the first release in board order with open work). The issue templates add new issues to the board; set Typ, Release, Epic and Priority there.

**Priority:** every open story or enabler on the board "PflanzenDex Roadmap" needs the field Priority (P0 critical, P1 high, P2 normal, P3 low). Set it when you create the ticket (`make issue PRIORITY=…`). `make claim` prints a warning when the claimed issue has no project priority, `make board` flags such items `NO-PRIO` (both only warn), and `make status-check` lists all gaps. Rule of thumb (starting values, the owner may overrule per ticket):

| Priority | Which tickets                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| P0       | Release R0 with label `blocker` or `kritischer-pfad`; labels `security`, `nightly`                            |
| P1       | Everything else in R0 and R1; bugs                                                                            |
| P2       | R2 and R3; tickets without a release (epics only; chores and process tickets get R2 by the `make issue` rule) |
| P3       | R4, R5, R6 and stage 2                                                                                        |

The status needs no manual care (see "Project status after the claim" above).

**Branch naming rule:** `<type>/issue-<n>-<slug>`, e.g. `chore/issue-243-claim-check`, where `<n>` is the issue number. The slug is up to four words of the issue title, lower case, at most 30 characters. Type: `fix` for the board type (field Typ) Bug, `chore` for Enabler, otherwise `feat`; the labels `bug` / `enabler` count only for an issue that is not on the board. Matching is by the issue number, so a story ID never links issues: many issues share one (US-QS-32), and `feat/issue-2355-x` and `feat/issue-2355-y` are the same issue. Branches made under the older story-ID rule (`feat/wac-01-messung`) carry no issue number: `make worktree` passes them without a check and says so.

Exceptions, all explicit:

- `ALLOW_PRIOR_WORK=1 make claim ISSUE=<n>` waives merged PRs that close the issue (follow-up work on a story). A merged PR that only refers to it (`Refs #n`) needs no waiver: it is printed as a note. Assignee, open PR and live branch are never waived.
- `SKIP_CLAIM_CHECK=1` skips the claim check of `make worktree`. Use it only for branches that are not a story.
- To take over a story, ask the assignee or unassign them on the issue; `make board` marks claims without a commit for `CLAIM_STALE_HOURS` hours (starting value 48, an assumption) as `STALE`.

`make board` flags: `STALE` (see above), `DOUBLE` (more than one assignee, live branch or open PR for one issue) and `NO-CLAIM` (a branch or PR exists, but nobody is assigned). Branches whose PR is merged or closed do not count as live.

Limits: the check needs `gh` and network; offline it warns and lets go. It is a local check (hook, make target), not a CI gate, so `--no-verify` bypasses it (PRIN-010, maturity `checked`).

## Start a new task

```bash
make worktree BRANCH=feat/<task>
```

`make worktree` first runs the claim check (`app/tools/workflow/claim/claim-check.mjs`): a branch with an issue number (`issue-<n>`) is refused when the issue belongs to somebody else or has not been claimed (`make claim` first); a branch with only a story ID passes without a check. If the branch already exists on `origin` (made by `make claim`), the worktree continues it. There is no check on push: anyone with access may push to a branch.

This calls `tools/repo/worktree-new.sh`: it fetches `origin/dev`, creates the branch and a worktree under `.worktrees/<branch>/` (slashes become dashes) and writes `.env.worktree`. The `.worktrees/` folder is the one of the main checkout, also when `make worktree` runs inside another worktree (it used to nest there, #1487).

Dependencies (#1487): if an installed `node_modules` with the same `package-lock.json` exists in another worktree (the one you run it from first, then the main checkout and the others), `app/tools/workflow/worktree/worktree-env.mjs --deps` copies it into the new worktree. The copy is independent: a reflink on btrfs or xfs (instant, no extra disk space until files change), otherwise a plain copy. Nothing is shared between worktrees; a copy that links back into its source is refused. Then `make setup` runs in the new worktree: it skips `npm ci` when the stamp matches, and installs otherwise (a cold install is much slower). The worktree is ready to commit in, so the commit hooks pass without another step. If `make setup` fails, the worktree stays and the script says to run `make setup` there. Two sessions never write into the same directory; `.worktrees/` and `.env.worktree` are ignored by git.

## Own ports and database per worktree

`app/tools/workflow/worktree/worktree-env.mjs` derives these from the branch name. The slot starts at the hash of the branch; when another worktree already holds that slot (its `.env.worktree` gives the test database port), the next free slot is taken, so two worktrees never share a port (issue 1745). The slots held by the other worktrees are read from `git worktree list`; the worktree itself is left out.

| Variable                                                | Meaning                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PFLANZENDEX_TEST_DB_PORT`                              | test database port (starting range 54400 to 54899)                           |
| `PFLANZENDEX_TEST_DB_NAME`                              | database name `pflanzendex_<branch>_<hash>`                                  |
| `PFLANZENDEX_DEV_API_PORT` / `PFLANZENDEX_DEV_WEB_PORT` | dev servers (ranges 54900 to 55399 and 55400 to 55899)                       |
| `PFLANZENDEX_E2E_API_PORT` / `PFLANZENDEX_E2E_WEB_PORT` | e2e gates and the Lighthouse runs (ranges 55900 to 56399 and 56400 to 56899) |

The ranges are an assumption (starting values). The fixed port 54329 is reserved for the main checkout. To use the variables, load them with `set -a; . ./.env.worktree; set +a` (not needed for `make dev`, see below).

**Gates never reuse a dev server.** In a worktree the e2e ports are apart from the dev ports, so `make e2e`, `one-screen`, `a11y-routes`, `ui-gates`, `lighthouse-signed` and `lighthouse` never attach to a `make dev` server: Playwright would reuse any server that already listens on its port. The main checkout keeps 5173 and 3000 for its gates, as before. In a worktree make exports `E2E_WEB_PORT` and `E2E_API_PORT` from `.env.worktree`; a value already in the environment wins. `make e2e-origin` allows the e2e web port at the shared Keycloak (`web-port.mjs`, see below). The e2e targets run it after `auth-up`, and it does nothing without a worktree port. `tools/lighthouse/lighthouse-run.sh` refuses to start when its port is in use, names the port, and stops its preview with the exit. Once the preview answers, the page it serves must be the `dist/index.html` of the build just made (`served-build.mjs`, issue 1733), so a stale preview cannot be measured.

**A local Playwright run never reuses a server of another checkout (US-DEV-08, issue 2390).** Playwright reuses any server that already listens on its port, and a server of the main checkout listens on 5173 and 3000. So a run started without `E2E_WEB_PORT` and `E2E_API_PORT` (`npm run e2e` or `npx playwright test` in a worktree, not only `make`) used to report the main checkout's code as its own. The config (`app/packages/e2e/playwright.config.ts`) now reads the ports itself when the variables are unset: the keys of this worktree's `.env.worktree`, else 5173 and 3000. Before Playwright decides about reuse, it checks both ports (`e2eServerGuard` in `app/tools/workflow/worktree/clean-ports.checkout.mjs`). A listener that runs in another git checkout, or whose working directory cannot be read, makes the run fail at once, with one message that names the port, the pid, the other checkout and this checkout, and the two ways out: stop that server, or set `E2E_WEB_PORT` and `E2E_API_PORT` to free ports. A server of this worktree is reused, as before. In CI nothing changes: no check, no worktree file is read, the ports are the environment's or the defaults, and Playwright does not reuse a server there.

**Older worktrees** written before the e2e keys lack them. A Playwright run there stops with the command below instead of testing the main checkout's servers (issue 2390). Re-run the writer from the worktree (or from any checkout of the repository): `node app/tools/workflow/worktree/worktree-env.mjs <branch> > .env.worktree`. A re-run can move the worktree to the first free slot from its hash, so stop running servers and the test database first.

### `make dev` in a worktree (#904)

`make dev` runs `app/tools/workflow/worktree/dev-servers.mjs` (the `dev` script of `app/package.json`). When `.env.worktree` exists at the worktree root, it starts the two servers with that worktree's values and nothing has to be set by hand:

- the API on `PFLANZENDEX_DEV_API_PORT`, with `PORT`, `WEB_ORIGIN`, `AI_RESOURCE_URL` (the API's `/mcp`) and `DATABASE_URL` of the worktree;
- Vite on `PFLANZENDEX_DEV_WEB_PORT` with `--port` and `--strictPort`, and `VITE_API_URL` pointing at the API;
- the test database `pflanzendex_test` on `PFLANZENDEX_TEST_DB_PORT`. This is the database that `make db-up` creates (`POSTGRES_DB`) and that `make migrate` and the tests use through `PFLANZENDEX_TEST_DATABASE_URL`. `PFLANZENDEX_TEST_DB_NAME` is written by `worktree-env.mjs`, but no target reads it: the port already makes the database unique per worktree, and a database under that name would be empty and unmigrated.

Rules of the launcher:

- A busy API or web port stops the start before any server runs, and the message names the port. Vite never moves to another port. If one server fails, the other is stopped too. `make clean-ports` stops the processes of your own user that listen on the API and web port of this worktree (each one is named; another user's process is reported and left alone).
- A variable already set in the environment wins over the file, so `PORT=4000 make dev` starts the API on 4000 and `VITE_API_URL` follows it. An empty variable counts as not set.
- Without `.env.worktree` (the main checkout) the command is the one from before: 3000 and 5173, no variables, no port flags.
- `TAXONOMY_BUILD` is not set. It changes what the Pokédex shows (the foreign taxonomy build runs or is skipped), so a worktree should not differ from the main checkout by default. Set it per run when a worktree should skip the build: `TAXONOMY_BUILD=off make dev`.
- Sign-in on the worktree port still needs the redirect step below (`web-port.mjs`), because the shared Keycloak only knows port 5173. Sign-in on a worktree port needs one more step after `make auth-up`: `cd app && node tools/keycloak/web-port.mjs` allows that port as redirect origin of the Keycloak web client (the realm export only knows 5173; Keycloak has no wildcard for ports).

### One shared Keycloak for every checkout

All checkouts share one Keycloak container (`pflanzendex-keycloak`, port 18081) and one mail catcher. Its realm lives in memory, so recreating the container drops every port added with `web-port.mjs` and signs every session out. Therefore (issue 1187):

- Only the main checkout holds `app/config/dev/.env` with `KC_ADMIN_PASSWORD`. `make auth-up` in the main checkout creates it when it is missing; in a worktree it refuses ("run `make auth-up` in the main checkout first") and never writes a `.env` of its own.
- `make auth-up`, `make auth-down` and `make stop` always run `docker compose` with the main checkout's `compose.yaml` and `.env`, also from a worktree. A worktree's own copy of the compose file would recreate the container even with the same password, because its mount paths differ. Changes to the realm or the theme take effect only after they are on the main checkout's branch and the auth server is recreated there.
- When the running container was started with another admin password than that file, `make auth-up` refuses instead of recreating it. To restore: `make auth-down && make auth-up` in the main checkout, then `cd app && node tools/keycloak/web-port.mjs <port>` for every web port in use, and tell the other sessions.
- `make auth-down` and `make stop` in any checkout stop the shared containers for everyone.
- Tools that need the admin password (`web-port.mjs`, the demo seed, the e2e account helper) read the main checkout's `.env` through the git common dir (`app/tools/keycloak/dev-env.mjs`), so they work from a worktree too. `KC_ADMIN_PASSWORD` in the environment overrides it.
- Self-test: `app/tools/keycloak/auth-up.test.mjs` (a throwaway repository with a linked worktree and a stubbed `docker`).

### Memory caps of the local containers

Every worktree starts its own test database, so the local containers are capped (#1084, starting values, assumption): the test database 512 MB (`make db-up`, override with `DB_MEMORY=1g`), Keycloak 768 MB with a 384 MB JVM heap and Mailpit 128 MB (`app/config/dev/compose.yaml`, override with `KC_MEMORY`, `KC_JAVA_HEAP`, `MAILPIT_MEMORY` in `app/config/dev/.env`). An existing container keeps its old settings: run `make db-down` or `make auth-down` once to recreate it. The caps are local only. CI brings its own database service, and production has its own limits in `app/config/deploy/docker-compose.yml`. `app/tools/dev/tests/dev-memory-caps.test.mjs` fails if a deploy file or deploy workflow loads a dev compose file or uses one of these variables.

## One heavy job at a time (US-DEV-08, issue 1745)

The UI gates, Lighthouse, the e2e tests and `make ci` load the workstation so much that two of them at once, from two worktrees, got the IDE killed by systemd-oomd. `make heavy-lock` (`tools/lint/heavy-lock.sh`) therefore runs first in `make e2e`, `one-screen`, `a11y-routes`, `ui-gates`, `sb-test` (one story test in a browser, issue 2523), `lighthouse` and `lighthouse-signed`; `make ci` takes the same lock in its parts runner (`app/tools/dev/agent/ci-parts.mjs`) before the first part, so it keeps no make prerequisite that could stop it (US-QG-02). It is one lock for the whole machine: the first job runs, and a second job from any worktree of the checkout prints what it waits for and starts when the first one ends.

- **Where the lock lives:** in the git common dir, so every worktree of the checkout shares it. `heavy-job.lock` is the lock itself (an empty file that stays). `heavy-job.owner` is one line while the lock is held: owner pid, directory, target and time (UTC).
- **See the holder:** `cat "$(git rev-parse --git-common-dir)/heavy-job.owner"`. A waiting job prints the same holder.
- **Released with its owner:** the lock belongs to the make process that took it and is released when that process ends, also on a failure or a kill. A note whose pid is dead does not count. A heavy target inside another one (`make e2e` run by `make ci`) sees the lock as its own and runs at once.
- **Waiting:** a free lock is taken silently. A wait prints its line after one second, naming the job and the holder, and again every 30 seconds. `HEAVY_LOCK_WAIT=<seconds>` bounds the wait (default 3600, a starting value, assumption); then the job exits with 1 and names the holder. Example: `HEAVY_LOCK_WAIT=600 make e2e`.
- **Maximum hold time (issue 2370):** `HEAVY_LOCK_MAX_HOLD=<seconds>` (default 1200, a starting value, assumption). A wait that finds the holder older than that also prints its label (directory and target), its age and that it is over the maximum. It only reports: nothing is stopped or taken from the holder. Tell the owner of such a holder; do not kill it.
- **One command under the lock (issue 2370):** `make heavy RUN="<command>"` takes the lock through its prerequisite `heavy-lock`, runs the command in its own process group (`tools/lint/heavy-lock.run.sh`) and releases the lock when the command ends, on success, on failure and when make is killed (the command's group is stopped then too). Its exit code is the script's; make itself exits with 2 when the command fails and prints `Error <code>`. Example: `make heavy RUN="cd app/packages/web && npx playwright test"`. An empty or blank `RUN` is refused before the lock is taken. Agents use this form for every ad-hoc heavy command.
- **Never hold the lock across turns:** do not start `make heavy-lock` by hand and keep it running while you think, write or wait (a `sleep` holder or a shell that waits for the lock). On 2026-11-20 a recheck held the lock for over 20 minutes that way, and two tickets waited behind it. A heavy target (`make e2e`, `make one-screen`, …) or `make heavy RUN=` holds it only around its own command.
- **CI does not use it:** with `CI` set the target does nothing, because each CI job is its own machine; `make heavy RUN=` still runs its command there. `make gates`, the pre-push hook and the other targets stay outside the lock; they are light.
- The scripts need `setsid` and `flock` (util-linux).
- `/tmp` is a tmpfs on the workstation: bulky output there uses RAM. Check `df -h /tmp` before a long run and keep big logs in the checkout's `.cache/` (ignored by git) instead.

## CI reruns and merges

- Two timed-out runs on one head: rerun each one with `gh run rerun <id> --failed`.
- Rerunning an `edited` run replays the original title.
- `gh run view --log` shows the latest attempt for every attempt of a run: download the logs of the earlier attempts before a rerun.
- `make merge` deletes the PR's remote branch (`gh pr merge --squash --delete-branch`) and, after a successful merge, removes the test database of the merged branch's worktree (`make db-down` in that worktree, US-DEV-08, issue 2325); the main checkout's database is never touched. It does not remove the local worktree, so remove that by hand after the merge. When the owner merges a PR by hand, run `make db-down` in its worktree before `git worktree remove`, or the worktree's test database container keeps running. `make db-up` labels every test database container with its worktree path (`pflanzendex.worktree=<path>`), and `make db-prune` removes the containers whose worktree no longer exists (US-DEV-08, issue 2396): a labelled container when its path is no longer a live worktree, an older container without the label when no live worktree has its port (read from that worktree's `.env.worktree`). The main checkout's container and every live worktree's are kept; `DRY_RUN=1 make db-prune` only prints what it would remove. Run `make db-prune` after each `git worktree remove`, so a container that `make merge` could not drop (a worktree removed by hand) does not keep running.
- Never chain merges in a script while the owner may merge by hand, and agents never arm auto-merge. In a merge chain, check `make merge`'s exit code before any cleanup: `make merge … | tail -1 && cleanup` ran the cleanup after a failed merge, because `tail` decides the exit code.
- Two PRs that shrink the same baseline conflict: take dev's file, re-apply your own removals, and set `maxEntries` to dev's value minus your removals. A change that grows a baseline needs a human; `make gate-plan` refuses baseline files, because they are not gate files.

## Owners and number assignment

- `.github/CODEOWNERS` names an owner per folder; changes to it require review.
- `make gates` includes `check-specs`: duplicate file numbers in `docs/specs/product/` and IDs defined twice (`US-/FR-/DM-/E-`) fail the run. Whoever adds a number checks the highest free number on the current `origin/dev`; on a conflict the later PR rebases and renumbers (IDs of existing entries are never renumbered).

**Migration numbers:** `make migration NAME=<module>_<short_name>` creates the file with the next number that is free on `origin/dev`, in every open PR branch and in numbers reserved in a PR Handoff (one `gh pr list` call, `git ls-tree` per branch). `RESERVE_MIGRATION=1 make claim ISSUE=<n>` writes the next free number into the draft PR's Handoff (`- **Migration number:** 0067`); `make migration` on that branch uses it. The gate `npm run migration-numbers` (part of `make gates`, `app/tools/workflow/claim/migration/`) fails on two migrations with the same number and on a new migration whose number is not above the highest on `origin/dev`; fix: merge `origin/dev`, rename only your own new file with `make migration`. Applied migrations are never renumbered.

## Rules for agents

- Do not commit without being asked; do not change other people's files without a task.
- Touch shared files (Makefile, `package.json`) as little as possible; put your own logic into your own scripts.
- Report before writing if a file has changed since it was read.

### The orchestrating session (owner decisions 2026-11-09 and 2026-11-14, issues 1747 and 2099)

The roles are indexed in `CLAUDE.md` ("Agent sessions and models"); each subagent's rules are in its `.claude/agents/<name>.md`. The orchestrating session (the main session, Opus at effort medium; ticket leads run on Sonnet since issue 2413) has no definition file; its rules are these:

- It picks and claims tickets (`make claim`, `make worktree`), sets the PR title and starts one `ticket-lead` per ticket with only the ticket's facts. When it works a ticket itself, it takes the ticket-lead role and follows `.claude/agents/ticket-lead.md`.
- One lead runs one implementer. The orchestrator adds implementers by the machine's resources (CPU, free RAM, running heavy jobs); heavy work waits on the heavy lock: `make heavy-lock` for a heavy target, `make heavy RUN="<command>"` for an ad-hoc command (see "One heavy job at a time").
- No hard cap on open PRs; with three open PRs that are all drafts, it finishes them before claiming more.
- It takes the owner's decisions and relays them to the leads, and spot-checks each lead's report against the merged head on `dev`.
- It works on one large item and several small items at once, only when their files do not collide (owner decision 2026-11-26, d-118). Before it starts an item, it compares `git diff --name-only origin/dev...<branch>` of each running item with the files of the new one. This replaces the one-item rule of 2026-11-21 (issue 2413). The item's own implementer and specialists are part of it. Heavy jobs still go through `make heavy` and `make heavy-lock`.
- The owner may set GitHub auto-merge on an `owner-merge` PR. Before a lead says "waiting for the owner" or runs `make merge`, it checks `gh pr view <n> --json autoMergeRequest`. With auto-merge on, the lead pushes only complete states and never runs `make merge`.
- It asks the owner the item's open questions before the lead briefs an implementer (step 0 of `ticket-lead.md`), so an item stops for the owner once. While the owner is present, it asks the open decisions of an item at once. A tool-adoption ticket stops at its marked decision points, even at night (d-114).
- After each merged item it updates the session handoff and suggests `/clear` to the owner, once every open PR's Handoff carries the state, open questions and owner decisions; a short context costs less on every turn (issue 2413).

### What the SubagentStop hooks check (US-QG-07, issues 2371 and US-DEV-02)

When an `implementer` or a `ticket-lead` stops, two Claude Code hooks look at its run (`.claude/settings.json`, `run.mjs`). Both read the worktrees the subagent entered with `cd <folder> &&` from its transcript; only the first one can block, and it does so once.

- `subagent-stop` (the `implementer` only, `.claude/hooks/subagent-gates.mjs`) runs `make gates` in that worktree, unless a green stamp covers the same commit and code. A red run blocks the end once with its output; the second red end is reported as a system message.
- `subagent-push` (the `implementer` and the `ticket-lead`, `.claude/hooks/subagent-push.mjs`, issue 2371) adds the system message "no new commit pushed on <branch>" when the origin head of a worktree's branch did not move during the run. The start is the first timestamp of the transcript; the head at the start is the newest reflog entry of `refs/remotes/origin/<branch>` written in an earlier second, and the head at the stop is that ref. It flags nothing it cannot tell: a detached HEAD, a branch first pushed during the run, or a git error. It runs read-only git calls only (no fetch, no push, no write) and has a 15 s limit. The message is shown in the UI; a ticket lead still checks `git log origin/<branch>` itself.

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
