# 19 – Epic DEV: Development Process and Automation

As of: 2026-10-02 · **Draft.** Supplements `18-Architecture-and-Quality-Gates.md`. That document says **what** is checked. This one says **how** it is triggered, operated and brought into a workflow: task runner, hooks, routines, skills, process, release, migrations, parallel work, operation.

The model is the rule set of the project AdventskalenderTombola (`~/root/Code-Root/AdventskalenderTombola/`: `Makefile`, `.husky/`, `.github/workflows/`, `.agents/`, `.claude/`, `Docs/dods/`, `Docs/documentation/strategy/process/`). The section "Observations from Tombola" names what is **not** taken over.

## Principles

| ID   | Principle                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-01 | **One entry point:** everything runs through named targets (`make <target>`). CI calls the same targets as a developer.                                                                    |
| D-02 | **The server is the truth:** local hooks are convenience and can be bypassed. CI repeats every check and is the only binding gate.                                                         |
| D-03 | **Judgment by skill, checking by gate:** a skill is prose for things that need judgment. What can be checked becomes a gate and the skill for it is dropped (maturity ladder in `US-QG-06`). |
| D-04 | **Automation with an owner:** every routine has trigger, owner, output and a rule for its failure.                                                                                         |
| D-05 | **Report honestly:** a run reports pass or fail, not "should work". A target that swallows errors is a defect.                                                                             |
| D-06 | **Small and reversible:** releases are small, migrations forward-compatible, the fallback is planned before the deploy.                                                                    |

## User stories

### US-DEV-01 · One entry point for all tasks (task runner) · 🟨

As a **developer** I want to start every recurring task with one command and run locally the same thing as CI.

Acceptance criteria:

- A `Makefile` in the root directory is the **documented entry point**; `make help` lists all targets with one sentence.
- At least these targets (names are a proposal):

  | Target                              | Purpose                                                                     |
  | ----------------------------------- | --------------------------------------------------------------------------- |
  | `setup`                             | First installation (dependencies, example environment, hooks, test database) |
  | `dev`                               | Start database, API and web together locally                                |
  | `lint`, `format`, `typecheck`       | Checks from QG-C and QG-K                                                   |
  | `test`, `test-e2e`                  | Tests (unit/integration, end-to-end with auto-start)                        |
  | `spec-check`                        | Spec consistency and traceability (QG-T4, QG-U2)                            |
  | `gates`                             | all fast gates (QG-C, QG-K, QG-S1), identical to pre-push                   |
  | `ci`                                | **all** gates in the order of CI, aborts at the first error                 |
  | `db-migrate`, `db-reset`, `db-seed` | Database (see US-DEV-07)                                                    |
  | `pokedex-build`                     | Taxonomy build (US-POK-03)                                                  |
  | `release-dry-run`                   | shows the next version and the notes without publishing anything            |
  | `clean`, `clean-ports`              | Clean up                                                                    |

- `make ci` **aborts at the first error** and has the same scope as the CI jobs. An error is never hidden by `|| true`, `tail` or a pipe (D-05).
- The CI workflows call the `make` targets. If there is a deviation (e.g. services in CI), it stands as an environment query in the target (`ifndef CI`), not as a second implementation.
- The targets run on Linux, macOS and under WSL; path differences (Python or Node call, virtualenv directories) are resolved **in one place**, not three times (finding from Tombola).
- The Makefile contains no domain logic, only calls. Everything non-trivial lives in scripts (`scripts/`) with tests.

### US-DEV-02 · Hooks catch early without annoying · 🟨

As a **developer** I want checks exactly when they are cheapest.

Acceptance criteria (git hooks, managed via a tool like Husky, installed by `make setup`):

- **`commit-msg`:** commitlint (QG-C1).
- **`pre-commit`:** only on **changed files** and under 10 seconds (assumption): formatting (Prettier) and basic lint. Domain gates do not belong here (Tombola deliberately has nothing here; we add only the fast part).
- **`pre-push`:** `make gates` (QG-C2 to QG-C5, QG-K1, QG-S1) with a clear error message and re-run command (US-QG-01).
- **`post-merge` / `post-checkout`:** point out changed dependencies or migrations (`make setup` / `make db-migrate`), but execute nothing themselves.
- Any bypass (`--no-verify`) is permissible, but ineffective for the merge: CI repeats everything (D-02).

Acceptance criteria (agent hooks, Claude Code `settings.json` in the repo):

- **`Stop` hook (message only, never blocks):** if code was changed in the session and `make ci` or `make gates` did not run afterwards, a note appears to the human (pattern: the `review_analysis.py` hook in Tombola, which only shows a system message and does not redirect the model).
- **`PreToolUse` guard:** changes to gate configurations (`.husky/`, workflows, coverage/complexity thresholds, baseline lists) require explicit confirmation by the human. This technically enforces `US-QG-07` ("the agent lowers no threshold to get around a failure").
- **`PostToolUse` hook:** formats changed files (Prettier) and, for changes in `Docs/PRODUCT-SPECS/`, starts the spec check (`spec-check`) as a message.
- Hooks have their own tests (example Tombola: `review_analysis_test.py`) and a time limit; a hanging hook must not block the session.
- The permission list (`permissions.allow`) contains only reading and gate-near commands (`make ci`, `git status`, …), no write or deploy commands.

### US-DEV-03 · Routines: regularly running checks and maintenance · ⬜

As an **operator** I want things to be checked that get worse without a code change.

Acceptance criteria: every routine stands in the table with trigger, owner, output and failure. New routines are entered there (D-04).

| Routine                                                                      | Trigger                                      | Owner      | Output                                                              | Failure                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------- | ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Dependency updates (grouped: patch, minor, dev)                              | weekly (Dependabot or equivalent)            | Maintainer | PR with the full suite                                              | Auto-merge only with a green status, not for major version jumps (FR-QG-15)  |
| Full suite on `dev` incl. end-to-end                                         | nightly                                      | CI         | Status message                                                      | Message to maintainer, ticket                                                |
| Security audit (new vulnerabilities without a code change)                   | weekly                                       | CI         | Report (QG-S2)                                                      | high findings block the next release                                         |
| Drift test of external sources (Wikipedia, Wikidata, GBIF, OpenTree)         | weekly                                       | CI         | Contract tests against the APIs, message on format change (NFR-17)  | Pokédex build stays at the last good state (US-POK-03)                       |
| Pokédex build                                                                | on catalog change, additionally weekly       | System     | new tree or unchanged state                                         | Error list, never a partial result                                           |
| Reminder job (epic MON)                                                      | daily, time per account                      | System     | Messages                                                            | Repetition, then marking in "Hints" (FR-MON-08), alarm (NFR-18)              |
| Backup and **restore test**                                                  | daily or monthly                             | Operator   | Backup, test log                                                    | a backup that cannot be restored is an incident (NFR-15)                     |
| Cost report (hosting, storage, AI per account)                               | monthly                                      | Operator   | Report (NFR-16)                                                     | Exceeding a limit triggers a review                                          |
| Gate health: baseline list, exception markers, gates without a finding for 3 months | quarterly                             | Maintainer | Short report (US-QG-06)                                             | Gate is tightened, removed or hardened                                       |
| Unused code report: code and dependencies only tests keep alive (QG-C6)      | weekly                                       | CI         | One open issue `unused-code`, updated weekly, closed when empty     | deleted, wired in or kept with a reason; never deleted automatically         |
| Catalog review list (AI-created profiles, user proposals)                    | weekly                                       | Operator   | worked-off list (US-POK-02, FR-BES-06)                              | Backlog is made visible                                                      |
| Deletion requests (GDPR)                                                     | continuous, set deadline                     | Operator   | Deletion log (US-ACC-04)                                            | Deadline exceeded = incident                                                 |

- Recurring agent tasks (e.g. weekly gate health report) may run as a **scheduled agent**; they only write reports and open proposals, they change no gates.

### US-DEV-04 · Skills and playbooks for recurring tasks · 🟨

As a **developer (and AI)** I want a proven guide for recurring tasks instead of improvising every time.

Acceptance criteria:

- Skills live **once** in the repo (`.agents/skills/<name>/SKILL.md`), tools link there (`.claude/skills/<name>` as a link). No second copy, no drift (Tombola pattern).
- Every skill has: name, description with **trigger** ("Use when …"), numbered steps, **check command** (e.g. `make test`), expected output. A skill without a concrete check command is unfinished (finding from Tombola: `pre-commit-quality_check` only describes "run linters", without a command. With us it calls `make ci`).
- A check script (`make skills-check`) ensures: frontmatter complete, referenced paths and commands exist, links not broken, no orphaned skills.
- Initial set (derived from the epics, not copied from Tombola):

  | Skill                                                              | Purpose                                                                                                                                     |
  | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | `spec-to-tests`                                                    | create tests with story ID from the acceptance criteria of a story (P-06)                                                                   |
  | `add-core-operation`                                               | new validating operation in `core` with test, error code, AI release (KI-R1)                                                                |
  | `add-epic-feature`                                                 | story → test → code → gates → update spec status                                                                                            |
  | `tenant-isolation-test`                                            | tenant test for a new operation (QG-D1)                                                                                                     |
  | `privacy-whitelist`                                                | field whitelist and contract test for social/partner outputs (QG-D2)                                                                        |
  | `db-migration`                                                     | forward-compatible migration with test and fallback plan (US-DEV-07)                                                                        |
  | `error-code`                                                       | new error code with translation (FR-QG-11)                                                                                                  |
  | `date-and-timezone`                                                | local date and time zone (NFR-08, cause of B-01)                                                                                            |
  | `photo-pipeline`                                                   | photo processing and EXIF test (US-WAC-06)                                                                                                  |
  | `catalog-batch`                                                    | create a catalog batch (20–40 species), run the build, check warnings (US-POK-02)                                                           |
  | `ki-tool-contract`                                                 | release or change an operation for the AI interface: description, schema, error codes, contract test, whitelist (FR-KI-03, FR-KI-10)         |
  | `release-checklist`                                                | prepare and check a release (US-DEV-06)                                                                                                     |
  | `story-test-protocol`                                              | manual test protocol for flows that tests do not cover (pattern `ticket-test-protocol` from Tombola)                                        |
  | `recap-and-learnings`                                              | after a task, extract lessons and transfer them to the principles register or skills                                                        |
  | `discovery-review`, `compliance-review`, `review-failure-analysis` | review cycle (US-DEV-05)                                                                                                                    |

- Promotion: if a skill step becomes a gate (e.g. "check that field X is not output"), the step in the skill is replaced by a reference to the gate (D-03).

### US-DEV-05 · Story lifecycle and review process · ⬜

As a **team** I want a fixed path from idea to merge that fits the spec.

Acceptance criteria:

- **Lifecycle of a story:** ⬜ planned → 🟨 in progress (branch exists) → ✅ implemented (merged into `dev`, test with story ID present and green). The spec status and the counters in `README.md` are changed **in the same PR** (FR-QG-03, QG-U2 checks that).
- **Project status follows the PRs (automated):** Given a PR whose body says `Closes #n`, When it is merged into `dev`, Then the project status of #n is `On dev`; When it is closed without a merge and no other open PR names #n, Then `In Progress` goes back to `Todo`; When the release PR `dev` → `main` is merged, Then every `On dev` item becomes `Done`. A closed issue stays `On dev` until the release. `make status-check` lists items whose status contradicts the PRs and open items without a priority.
- **Flow:** read story → derive tests from the criteria (skill `spec-to-tests`) → implement → `make ci` green → PR with description (story IDs, deviations from the spec) → review → merge.
- **Definition of Ready:** a story may be started when criteria are formulated verifiably (Given/When/Then), dependencies in `16-…` are clarified and open decisions (E-nn) are decided.
- **Definition of Done:** FR-QG-10.
- **Review (two-stage, optional from R1):** first **blind** by an agent that does not know the principles register, then failure analysis (`review-failure-analysis`) that records "why better, how measurable, how checkable" for every finding and presents it to the maintainer **for confirmation**. Compliance review against known principles only on request or before releases (Tombola pattern, E-18).
- **Decisions as ADR:** when an E-nn is decided, an entry arises under `Docs/decisions/NNNN-title.md` (context, decision, consequences); the row in `16-…` refers to it.
- **Pitfalls register:** recurring errors (time zones, error texts, test synchronization) stand as short entries under `Docs/pitfalls/` and are added to when something is found (pattern `common-pitfalls`). Entries that can be checked become gates.
- **Documentation process:** a code change without a matching spec or docs change stands out in review; docs commits carry `docs:`; docs are gated with markdown lint and link checking (QG-U2).

### US-DEV-06 · Release process · 🟨

As an **operator** I want releases that are small, traceable and reversible.

Acceptance criteria:

- **Versioning:** SemVer, automatically from Conventional Commits (semantic-release or equivalent, E-13). `0.x` until parity (R1), `1.0.0` with the first release for strangers (stage 2). No manual setting of version numbers.
- **Trigger and chain:** a release is the merge from `dev` to `main` via pull request with the full suite. The release workflow runs on `main` **only for commits with a green `ci-status`** (pattern: `workflow_run` on "CI Pipeline" with a status check), only then the deploy. A red CI aborts both without creating a version. After the release `main` is merged back into `dev`, so that changelog and version commits do not let the branches diverge.
- **Result of a release:** git tag, release notes from the commits as a GitHub release (instead of `CHANGELOG.md` in the repo, ADR [0002](../decisions/0002-release-from-tags.md)), container image, database migrations (US-DEV-07), catalog/tree state (versioned, separate from the code, US-POK-03).
- **Version visible:** the version is in the app (footer/about page), in error reports and in the health endpoint. One source (tag), no second maintenance (pattern `sync_version.py`, but without writing into versioned files).
- **User-facing changelog:** for `feat:` and `fix:` QG-U3 demands a short German entry ("New in this version") that the app displays. For internal changes `[skip-changelog]` suffices.
- **Cut:** release contents follow R0 to R6 (`16-…`). A release is approved only when the core flows of its cut are green (FR-QG-08) and, for social releases, QG-D1/QG-D2 stand.
- **Feature flags:** social functions (R2, R3), AI (R4) and recommendations (R5) can be switched off per account or globally. This allows shipping code early and opening the function first for the three start users.
- **Deploy:** deliberate approval (E-14), then an automatic **smoke test** against the health endpoint and a core flow (sign in, Today list); if it fails, **automatic fallback** to the previous version.
- **Fallback and hotfix:** the previous container stays available; a hotfix is a branch from `main`, via PR with the full suite to `main`, only a small cut, not past the gates; afterwards back-merge into `dev`.
- **Release checklist** (skill `release-checklist`): CI green, migrations checked and backup fresh, changelog complete, feature flags set, privacy gates green, fallback plan known, operator informed.
- `make release-dry-run` shows version and notes without publishing.

### US-DEV-07 · Database migrations are safe · ⬜

As an **operator** I want schema changes without data loss and without downtime.

Acceptance criteria:

- Migrations are versioned, in the repo, and run automatically on deploy before the new version starts.
- **Forward-compatible (expand/contract):** a migration never changes things so that the **previous** app version breaks; columns are first added, then used, then removed in a later release. This makes the fallback work (US-DEV-06).
- Every migration has a test on a database with realistic data (test data set in the order of magnitude of the prototype data, 13 species, 17 specimens, measurement series (as a fixture, no import); pattern: test data script in Tombola).
- Before every migration in production a fresh, **restorable** backup exists (NFR-15).
- Row-level rules of the tenant isolation (NFR-09) are migrated along and checked by QG-D1; a migration that removes a rule fails QG-D1.

### US-DEV-08 · Parallel work without collisions · 🟨

As a **team (humans and agents)** I want to work simultaneously without overwriting each other's files.

Background: while writing these specs two sessions wrote in the same folder at the same time; the consequence was doubly assigned file numbers (two files carried the number 12) and changes that a session noticed only afterwards. The process should prevent that.

Acceptance criteria:

- **One task, one branch, one working directory:** parallel work runs in separate git worktrees (pattern `.worktrees/` in Tombola). Two sessions never write in the same directory.
- **Owner per area:** a `CODEOWNERS` file names an owner per epic or folder. Changes to it require review; a change in a foreign area without agreement stands out.
- **Number assignment protected:** spec files and IDs (`US-/FR-/DM-/E-`) are assigned centrally; the spec check (QG-U2) rejects duplicate file numbers and duplicate IDs.
- **Tests not in parallel on shared resources:** a test lock mechanism prevents two runs from using the same database or the same port (pattern `with-test-lock.cjs` in Tombola); unique ports/database names per worktree are an alternative.
- **Agents:** do not commit unasked, change no foreign files without an assignment and report before writing if a file has changed since reading (the tool already reports that).
- **One story, one assignee (claim):** whoever starts a story or enabler claims it first with `make claim ISSUE=<n>`. Given the issue has an assignee, an open or merged PR, or a branch on `origin` with the story ID when the claim is made, then it aborts with the finding and writes nothing. It first checks that `node_modules` exists and that `origin/dev` has a `Makefile`. Otherwise it creates the branch, sets the assignee and the project status "In Progress" and opens a draft PR with a "Handoff" section. If a step fails, it undoes the steps already written (branch deleted, assignee removed, status "Todo"); a re-run then works cleanly. `make board` shows per open story the assignee, PR and age of the last commit and marks stale claims (starting value 48 hours without a commit, assumption) and double claims; `make worktree` rejects stories that belong to someone else; a push is not checked. The check is local (no CI gate); operation: `Docs/operations/parallel-work.md`, principle PRIN-010.

### US-DEV-09 · Operation: health, alarms, runbooks · ⬜

As an **operator** I want to know when something is wrong before users report it.

Acceptance criteria:

- Health endpoint (API, database, job queue, object storage) with version; queried by the deploy and by monitoring.
- Errors and failed jobs create an **operator message** (NFR-18) without user data in plain text.
- Runbooks under `Docs/operations/` for: restoring a backup, fallback, migration fails, photo storage full, AI interface disturbed or abused (block connection), reminders do not run, GDPR deletion, security incident.
- A failure of an external source or of the AI impairs no core function (NFR-17, FR-KI-05).
- Operating metrics: availability, error rate, job runtime, cost per account (NFR-16).

### US-DEV-10 · Repository statistics in the README · ✅ new

As a **developer or visitor of the repo** I want current statistics in the root `README.md`, so that I see size, progress and the most notable features at a glance without asking anybody (or an AI) to count.

Acceptance criteria:

- **Generated by a checked-in script, not by hand or by an AI:** `scripts/repo-stats.sh` (bash, git and awk only, no network) rewrites the block between the markers `<!-- repo-stats:start … -->` and `<!-- repo-stats:end -->`. It runs **once per pull request, before review**, not per commit (owner decision 2026-10-05): `make pr [PR=<n>]` (`scripts/pr-ready.sh`) regenerates the block, commits `README.md` as `docs(dev): update repository statistics` only if it changed, pushes the branch and marks the PR ready. `make repo-stats` regenerates it by hand. No git hook runs it.
- **Fast:** under 1 second on the current repo (assumption, starting value; measured 0.2 s on 2026-10-05).
- **Branch-neutral:** given two branches cut from the same `dev`, when both run `make pr`, then the history part of the block is identical, because history numbers come from the merge base with `origin/dev` (fallback `HEAD`). Tree numbers come from the committed files, `README.md` itself left out; numbers from 1000 on are rounded to 3 significant digits, the tracked size to whole MiB from 10 MiB on. The block holds no branch name, time stamp or commit hash.
- **Refuses where it does not belong, and changes nothing then:** given the branch is `main` or `dev`, HEAD is detached, a rebase, merge, cherry-pick or revert is in progress, or there are uncommitted changes, when I run `make pr`, then it stops with the reason and writes, commits, pushes and marks nothing.
- **Idempotent:** given nothing changed since the last `make pr`, when it runs again, then it makes no new commit and only pushes and marks the PR ready.
- **Never fails silently (P-10):** missing markers end with a non-zero exit and a message naming `README.md`.
- **Content, in this order:** (1) what the app does: one row per product epic with status (✅ all stories done, 🟨 some done or in progress, ⬜ planned), name, short description and link from the spec index, story counts and a progress bar, complete areas first, plus a chart of stories by status; (2) engineering: repository size, production code per package, tests (files, cases, lines in relation to production code), migrations, error codes, ADRs, skills, runbooks, the process epics (QG, DEV) in the same table form, and lines by language; (3) activity: commits, people, latest release and commits per active day. Charts are Mermaid, because GitHub strips JavaScript from READMEs. Every number is counted from the repo; nothing is estimated (P-08).

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                      | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-DEV-01 | `make ci` ≙ CI jobs. A test or script compares the targets in the Makefile with the workflow jobs and raises an alarm on deviation (prevents drift, cf. FR-QG-01).                                                                                                                                                                                                                                                               | ⬜     |
| FR-DEV-02 | Hooks, skills, routines and process are **part of the repo** and changeable via pull request; no settings only on individual machines.                                                                                                                                                                                                                                                                                           | ⬜     |
| FR-DEV-03 | Every routine in US-DEV-03 is defined as a workflow or scheduled job in the repo and has an owner.                                                                                                                                                                                                                                                                                                                               | ⬜     |
| FR-DEV-04 | The principles register (US-QG-06) is validated by a script and maintained by review and failure analysis.                                                                                                                                                                                                                                                                                                                       | 🟨     |
| FR-DEV-05 | Versions arise only from commits (SemVer); a manually set tag or a manually changed version stands out in CI.                                                                                                                                                                                                                                                                                                                    | ✅     |
| FR-DEV-06 | Release notes and user-facing changelog are prepared bilingually (German first); texts live in translation files, not in the code (NFR-14).                                                                                                                                                                                                                                                                                      | ⬜     |
| FR-DEV-07 | Every release receives a **data state label** for catalog and taxonomy tree (date, number of species, number of errors).                                                                                                                                                                                                                                                                                                         | ⬜     |
| FR-DEV-08 | Scheduled agents and routines run with minimal rights (read only, write a report); deploy and secret rights belong only to the release workflow.                                                                                                                                                                                                                                                                                 | ⬜     |
| FR-DEV-09 | **One repo for spec, code and docs (E-05):** code lives under `/app`, all documentation under `/Docs` (specs in `Docs/PRODUCT-SPECS/`, process documentation next to it). The `Makefile` in the root directory calls into `app/`. CI jobs and release run with path filters; pure `docs:` commits create no release (FR-QG-14). `CODEOWNERS` separates the areas (US-DEV-08).                                                   | ⬜     |

## Observations from Tombola (not taken over or to be noted)

From reading the Tombola repo. They show what even a good rule set gets around.

| Observation                                                                                                                                          | Consequence for PflanzenDex                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The `make ci` target is a hand-built approximation of CI (pipes with `tail`, `\|\| true`) and can hide errors; the workflows do not call it.         | FR-DEV-01, D-01, D-05: one target, called by CI, aborts at the first error.                                                    |
| The detection of the Python virtualenv is mirrored in three places (root Makefile, backend Makefile, lint script), explicitly by comment.            | One task runner, one resolution (US-DEV-01).                                                                                   |
| The DoD names coverage ≥ 70 %, CI enforces 75 %.                                                                                                     | FR-QG-18: numbers exactly once, docs refer.                                                                                    |
| The skill `pre-commit-quality_check` contains only vague steps, no commands.                                                                         | US-DEV-04: a skill without a check command is unfinished.                                                                      |
| Several files were split only to keep the 200-line limit (comments in `pyproject.toml`, route files).                                               | US-QG-08: complexity and length are separate findings.                                                                         |
| The release line has two tools (npm and Python) for two packages.                                                                                    | With us one package, one tool (E-13).                                                                                          |
| Feature→`dev` PRs get no full CI (deliberate, cost), only dependency PRs.                                                                            | E-13: PRs to `dev` get fast gates and unit/integration, PRs from `dev` to `main` the full suite; pre-push locally.            |
| Jira status maintenance (TEST STATE, Done) is a process of its own.                                                                                  | Dropped: the spec status replaces the ticket (US-DEV-05). If tickets later, the same rule applies there.                      |

## Order of introduction

| Point in time | What stands before the first code                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before R0     | Makefile with `help`, `setup`, `lint`, `test`, `gates`, `ci`; hooks (`commit-msg`, `pre-push`); CI with collective status; `spec-check`; `CODEOWNERS`; worktree rule; skills `spec-to-tests`, `add-core-operation`; ADR folder              |
| Before R1     | Complexity gates (QG-K) with baseline list; `pre-commit`; `post-merge` notes; release chain (semantic-release, smoke test, fallback); migration test with prototype test data; operations basis (health endpoint, backup + restore test)     |
| Before R2     | Skills `tenant-isolation-test`, `privacy-whitelist`; routines: nightly suite, security audit; feature flags for social                                                                                                                    |
| Before R3     | Reminder job monitoring; routine cost report                                                                                                                                                                                              |
| Before R4     | Skill `ki-tool-contract`; routine evaluation of connection load                                                                                                                                                                           |
| Afterwards    | Review cycle (blind + failure analysis), scheduled agents, gate health report                                                                                                                                                            |
