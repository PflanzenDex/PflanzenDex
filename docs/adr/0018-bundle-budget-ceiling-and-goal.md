# 0018 · Bundle budget: a fixed ceiling of 140 kB and a goal of 125 kB

- **Status:** accepted by the project owner (2026-10-29).
- **Story:** `US-QG-07` (a gate changes only in its own PR with a reason), gate QG-U6 (`docs/specs/product/18-architecture-and-quality-gates.md`), DS-08 (`docs/guides/reference/design-system.md`)
- **Amends:** ADR [0007](0007-component-library-storybook-bundle-budget.md) decision 5. Measuring first and no invented numbers stay; the ratchet goes.
- **Tracking:** issue #928, PR #929

## Context

QG-U6 limits the initial JavaScript of the web app (gzip, everything a first visit loads before the current route renders). The limit was a ratchet: after every saving it was lowered to the new measurement plus about 5 kB, and it was never raised (170 → 152 → 136 → 125 kB, the last step on 119.9 kB measured). Next to it the report showed a "working target" of 140 kB, above the hard limit, so it steered nothing.

On 2026-10-29 `dev` measured 125.0 of 125.0 kB: every web change that adds a line to the first load failed the gate. Every route page already loads lazily (DS-08). What is left on the first load is mostly the framework the shell needs (gzip, estimated per package from the sourcemaps):

| Part                   | gzip    |
| ---------------------- | ------- |
| `react-dom`            | 65.3 kB |
| `react-router`         | 13.6 kB |
| `@tanstack/query-core` | 9.5 kB  |
| `tailwind-merge`       | 9.2 kB  |
| our own code (`web/*`) | 18.0 kB |
| everything else        | 9.3 kB  |

Measured in the attempts to free room on #929: splitting shared modules of our code (account views, unlock texts) saves a few bytes, because that code compresses well; loading `LockedRows` lazily makes the first load about 1 kB larger, because Rolldown then splits `navigation` and the lucide runtime into separate initial chunks; grouping chunks with Rolldown's `codeSplitting` does not help. Only dropping `tailwind-merge` saves real room (about 8.6 kB), and it would give up DS-31 (caller classes win over the component's own). Each ratchet step would repeat this hunt a few weeks later, in framework code, not in the code a story adds.

125 kB itself is a good size for a phone PWA. The problem is a limit with no room, not the size.

## Decision

1. **Hard limit: 140 kB gzipped, a fixed ceiling.** `bundle.initialJsGzipBytes` in `app/config/gates/quality-limits.json` stays at 140 kB when the bundle shrinks; it is no longer lowered after each saving. The gate blocks above it.
2. **Goal: 125 kB gzipped, report only.** `GOAL_BYTES` in `app/tools/check/supply/report-bundle.mjs`. `make bundle-report` (also in the CI job summary) shows the total against the goal and the limit. Over the goal is not a failure, but the PR says why and the next story that touches the web app looks first for code that can leave the first load (DS-08).
3. **Changing either number is an owner decision:** its own PR, a gate-file change, human merge (US-QG-07). Raising the limit above 140 kB needs a new ADR that names what the extra code buys.

## Reason

- 140 kB was already the owner's working number for phones (2026-10-06). The 15 kB between goal and limit is room for a story whose code must be on the first load (the shell, the navigation, the session), without a gate fight over framework bytes.
- The goal keeps the pressure visible in every PR summary, so the bundle does not drift up to the ceiling unnoticed.
- A fixed ceiling is a number people can plan against; a ratchet that sits at 0 kB left turns every web PR into a bundle task.

## Alternatives

| Option                                     | Verdict                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the ratchet, free room in code        | Rejected: about 5–9 kB of room only by trimming or dropping `tailwind-merge` (DS-31 at risk), and the same block returns after the next ratchet step.                 |
| Keep the ratchet, raise it once to 140 kB  | Rejected: the next saving would pull it down again to the measurement plus 5 kB, the same 0 kB situation a few stories later.                                         |
| No hard limit, report only                 | Rejected: DS-08 asks for route-level splitting to stay checkable; without a ceiling a large library on the first load passes unnoticed.                               |
| Limit at 170 kB (the DS-08 starting value) | Rejected: an unmeasured assumption from before the first measurement (ADR 0007 decision 5); 30 kB of room is more than any story needs and hides a misplaced library. |

## Consequences

- Room on the day of the change: 140 kB − 125.0 kB = 15 kB under the limit; 0 kB under the goal.
- The gate script, the report and their tests carry the new numbers; the explanation for readers is in `app/tools/check/supply/README.md`. QG-U6 in `18-architecture-and-quality-gates.md` and DS-08 point here.
- Issue #928 (free up room under 125 kB) closes with this decision instead of a code change. Freeing room stays welcome when a story finds it (DS-08), it is just no longer a precondition for every web change.
- **Renovate:** a dependency update that grows the first load shows up in the report against the goal; it blocks only above 140 kB.
