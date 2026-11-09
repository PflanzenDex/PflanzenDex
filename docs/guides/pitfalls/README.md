# Pitfalls register

Known traps that cost time or caused defects (US-DEV-05). An entry is short and says whether it can become a gate; when it does, the rule moves to `docs/guides/principles/` and the entry links to it.

## Format

One heading per entry `## PF-<nnn> <title>`, then:

- **Symptom:** what you notice.
- **Cause:** why it happens.
- **Fix:** what to do instead.
- **Can it become a gate?** yes (how) / no (why), with the principle ID once it exists.
- **Source:** where the finding comes from (spec ID, PR, incident).

IDs are never renumbered.

## PF-001 Calendar dates shifted by UTC

- **Symptom:** A plant captured late in the evening shows the next or previous day as capture or measurement date.
- **Cause:** The prototype formatted dates with `toISOString().slice(0, 10)`, which converts to UTC before cutting the string.
- **Fix:** Use the local date in the time zone of the user profile for every calendar date (NFR-08); compute phases and reminders in that zone.
- **Can it become a gate?** Yes, and part of it exists: the ESLint rule `no-restricted-syntax` in `app/eslint.config.js` (the constant `noUtcDateSlice`) forbids `toISOString().slice(0, 10)`, and the same call with `substring` or `substr`; `make gates` runs ESLint. It does not catch other UTC cuts, such as `slice(0, 7)` for months. Time zone tests: `app/packages/core/src/kernel/input/date.test.ts` (NFR-08, QG-D4) and the New York case in `app/packages/api/src/collection/specimens/specimens.test.ts` (FR-BES-04).
- **Source:** Defect B-01 of the prototype; `docs/specs/product/14-cross-cutting.md` (NFR-08), `docs/specs/product/18-architecture-and-quality-gates.md` (QG-D4).

## PF-002 Duplicate spec file numbers from parallel sessions

- **Symptom:** Two spec files carry the same number, or the same ID is defined in two places; references become ambiguous.
- **Cause:** Parallel sessions (worktrees) each pick the next free number independently.
- **Fix:** Check the next free number against `origin/dev` right before creating a file; resolve duplicates in the PR that merges second.
- **Can it become a gate?** Already is: `app/tools/check/docs/specs/check-specs.mjs` in `make gates` (principle PRIN-008).
- **Source:** US-DEV-08 in `docs/specs/product/19-development-process-and-automation.md`.

## PF-003 Definition of Done and CI disagree on a number

- **Symptom:** The DoD asks for coverage of at least 70 %, CI enforces 75 %; people pass the DoD and fail CI, or the reverse.
- **Cause:** The threshold was written down in two places and changed in one.
- **Fix:** State each threshold once, in the gate configuration; documents refer to it instead of repeating the number (FR-QG-18).
- **Can it become a gate?** Yes, and it is one: `npm run dod-numbers` (`app/tools/check/docs/specs/spec-numbers/check-dod-numbers.mjs`, QG-U11, FR-QG-18) fails when a DoD document repeats a threshold without a `<!-- gate: file#path -->` marker or with a number differing from the configuration.
- **Source:** Finding from the Tombola project, recorded in FR-QG-18 in `docs/specs/product/18-architecture-and-quality-gates.md`.

## PF-004 Caddy does not start with every capability dropped

- **Symptom:** a Caddy container with `no-new-privileges`, `cap_drop: [ALL]` and a non-root user exits at once with `exec /usr/bin/caddy: operation not permitted`.
- **Cause:** the official image gives the binary the file capability `cap_net_bind_service=ep`. The kernel refuses to execute a binary whose file capabilities it cannot grant.
- **Fix:** copy the binary in the image (`cp /usr/bin/caddy /tmp/caddy && mv /tmp/caddy /usr/bin/caddy`; a plain copy drops the capability). Ports below 1024 still work, because Docker lets unprivileged users bind them inside a container. An existing `/data` volume needs a one-time `chown` (runbook "Container privileges").
- **Can it become a gate?** Already is: `deploy-config.test.ts` checks the copy, the non-root user and the dropped capabilities of every service.
- **Source:** #761 (TE-03 hardening), found on 2026-10-30.

## PF-005 Two GraphQL counters, and a board listing that costs a point per item

- **Symptom:** `gh api rate_limit` shows the GraphQL budget nearly unused while calls fail with "API rate limit exceeded"; the reset named by the failing response's `X-RateLimit-Reset` header differs from the one `rate_limit` shows. One `gh project item-list --limit 1000` uses a large part of the hourly budget, and `make issue` plus a few board edits used all of it in about 20 minutes.
- **Cause:** The rate-limit endpoint and the responses report different windows, and the header of the failing response was the true one (2026-11-05). `gh project item-list` and `gh project field-list` load the fields of every item: one page of 100 items costs about 100 points, measured with GitHub's own `rateLimit.cost`. `make claim` read the whole board twice.
- **Fix:** Measure a GraphQL call with `rateLimit { cost }` in the same query, not with another endpoint's counters. Read the board with small queries: one issue's `projectItems`, plain field values in pages of 100, the field ids once per run (`app/tools/workflow/claim/lib/board-client.mjs`). Use REST for repository, issue and pull request calls (own budget). When a call fails on a rate limit, wait for the reset named in the failing response (its `X-RateLimit-Reset` header), not for the one `rate_limit` shows; do not work around the claim, and never poll `gh pr view` in a loop.
- **Can it become a gate?** No. The budget belongs to the shared account, not to the repository. The query shapes are unit-tested (`board-client.test.mjs`); the cost is not, so re-measure it by hand when a board query changes.
- **Source:** #1412, measured on 2026-11-05 (`gh api graphql` with `rateLimit { cost }`).

## PF-006 Board single-select options rewritten without their ids

- **Symptom:** After a field edit on the "PflanzenDex Roadmap" board, the value of that field is empty on every item.
- **Cause:** The options of a single-select field were written again without their ids. GitHub then drops each item's value, because the values point at the old option ids.
- **Fix:** Before any field edit, snapshot the items (small queries, see PF-005). Add options in the GitHub UI, never through the API.
- **Can it become a gate?** No: the safe path is a UI step, and no check can run a UI step.
- **Source:** Board field work, 2026-11 (lessons review of issue 1746).

## PF-007 vitest in a worktree without the test database URL

- **Symptom:** `vitest` in a worktree fails with "code.charCodeAt is not a function" or "No test files found", which points at the test code or the file pattern, not at the environment.
- **Cause:** `PFLANZENDEX_TEST_DATABASE_URL` is not set in the shell, and the test setup fails with a message that names something else.
- **Fix:** Run the tests with `make test-files`, or set `PFLANZENDEX_TEST_DATABASE_URL` with the test database port of this worktree (`PFLANZENDEX_TEST_DB_PORT` in `.env.worktree`, see `parallel-work.md`).
- **Can it become a gate?** No: the failure comes from the local shell, and CI runs with its own database service.
- **Source:** Test runs in worktrees, 2026-11 (lessons review of issue 1746).

## PF-008 Empty database after a chained `make db-up migrate browsers`

- **Symptom:** The database has no tables, and `migrate` fails with "role pflanzendex_app does not exist".
- **Cause:** The chain starts `migrate` right after `make db-up`, before the database has its application role, and the chain does not wait for it.
- **Fix:** Run `make migrate` on its own after `make db-up`, then check that the tables exist.
- **Can it become a gate?** Maybe: `migrate` could wait for the database before it runs. Not now.
- **Source:** Local setup of a worktree database, 2026-11 (lessons review of issue 1746).

## PF-009 Test tools hide console output and StrictMode effects

- **Symptom:** A `console.log` in a vitest test prints nothing. An effect that runs twice under React StrictMode in the app runs once in the test. A testing-library role query finds nothing while a modal is open.
- **Cause:** vitest hides console output and does not run StrictMode effects twice (only the e2e tests on the Vite dev server do). A modal layer makes the page behind it `aria-hidden`, and role queries skip hidden elements.
- **Fix:** Check StrictMode behavior in an e2e test on the dev server, not in vitest. Query the elements of the open layer, not the page behind it.
- **Can it become a gate?** No: these are the limits of the test tools; a gate would repeat them.
- **Source:** Test runs in the UI work, 2026-11 (lessons review of issue 1746).

## PF-010 `make -n` runs recipe lines that contain `$(MAKE)`

- **Symptom:** A dry run (`make -n <target>`) of a target that starts `auth-up` still starts the auth service.
- **Cause:** make runs recipe lines that contain `$(MAKE)` even in a dry run. That is make's behavior, not a bug in the Makefile.
- **Fix:** Never dry-run a target that starts `auth-up`; read its recipe in the Makefile instead.
- **Can it become a gate?** No: this is make's own semantics, and no gate changes it.
- **Source:** Makefile work in a worktree, 2026-11 (lessons review of issue 1746).

## PF-011 React Suspense holds a chunk wait after a fallback

- **Symptom:** A loading hook used inside a Suspense boundary gives a late or wrong loading state. A `ResponsiveModal` opened from that boundary renders its children outside it.
- **Cause:** React Suspense keeps a chunk wait about 300 ms after any fallback. `ResponsiveModal` portals its children outside the boundary that wraps its caller, so a loading state read inside that boundary does not follow them.
- **Fix:** Keep the loading hook outside the Suspense boundary.
- **Can it become a gate?** No: this is React's timing and the place of the portal; a test would only repeat it.
- **Source:** UI work on `ResponsiveModal`, 2026-11 (lessons review of issue 1746).

## PF-012 CodeQL blocks a merge while `ci-status` is green

- **Symptom:** The PR shows a green `ci-status`, but the merge is blocked by a CodeQL alert on the head. Typical findings: a regex that strips comment delimiters in one pass (`/<!--.*?-->/`), or a polynomial ReDoS pattern.
- **Cause:** CodeQL is required by the ruleset next to `ci-status`, and it flags such regexes in the changed code.
- **Fix:** Look at every check run on the head, not only `ci-status`, and read the CodeQL annotations through the check-runs API. Rewrite the flagged code without the regex. PR 1760 hit this in the comment stripping of the Lessons check.
- **Can it become a gate?** Already is: CodeQL, required by the ruleset, blocks the merge.
- **Source:** PR 1760 (Lessons check of `make pr`).

## PF-013 GitHub PR quirks: missing CI runs and merge conflicts

- **Symptom:** A push reaches the branch, but no CI run appears on the PR. A PR shows `mergeable_state: unknown`. `make merge` exits 2 with "merge conflicts".
- **Cause:** A push right after a merge into `dev` may not start CI on the PR (no `synchronize` event) while GitHub recomputes mergeability (PR 1757). A conflicting PR gets no CI run. `unknown` can also mean the PR is already merged.
- **Fix:** Make a new commit, or merge `origin/dev` into the branch: both bring the CI run back. Read `.merged` before you act on `mergeable_state: unknown`. For `make merge` exit 2: merge `origin/dev`, keep both news fragments, push.
- **Can it become a gate?** No: the event behavior belongs to GitHub, and the repo cannot test it.
- **Source:** PR 1757; `make merge` runs (lessons review of issue 1746).

## PF-014 No GitHub GraphQL in Claude Code cloud sessions

- **Symptom:** In a cloud routine or remote session, `gh pr list`, `gh issue list`, `gh issue comment` and `gh auth status` fail with 403 "GitHub GraphQL is not available from Claude Code sessions"; a write over the GitHub app can fail with `403 Resource not accessible by integration`.
- **Cause:** Cloud sessions reach GitHub only over REST through the Claude GitHub app; the `gh` subcommands above use GraphQL. A write needs the matching permission of the app on the repository (for comments: Issues, read and write).
- **Fix:** Use `gh api repos/<owner>/<repo>/…` (REST) for every read and write in a routine (`.agents/routines/*.md`); grant the app the permission a routine writes with.
- **Can it become a gate?** Partly: a check could refuse `gh pr list`, `gh issue list` and `gh issue comment` in `.agents/routines/`; not built (E-30, no incident yet).
- **Source:** First runs of the routines of issue 1753 (2026-11-09).
