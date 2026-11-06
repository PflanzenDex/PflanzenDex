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
- **Fix:** Measure a GraphQL call with `rateLimit { cost }` in the same query, not with another endpoint's counters. Read the board with small queries: one issue's `projectItems`, plain field values in pages of 100, the field ids once per run (`app/tools/workflow/claim/lib/board-client.mjs`). Use REST for repository, issue and pull request calls (own budget).
- **Can it become a gate?** No. The budget belongs to the shared account, not to the repository. The query shapes are unit-tested (`board-client.test.mjs`); the cost is not, so re-measure it by hand when a board query changes.
- **Source:** #1412, measured on 2026-11-05 (`gh api graphql` with `rateLimit { cost }`).
