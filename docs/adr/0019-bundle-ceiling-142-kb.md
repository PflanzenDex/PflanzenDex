# 0019 · Bundle budget: the ceiling rises to 142 kB for the account guard

- **Status:** accepted by the project owner (2026-11-23).
- **Story:** `US-QG-07` (a gate changes only in its own PR with a reason), gate QG-U6, DS-08
- **Amends:** ADR [0018](0018-bundle-budget-ceiling-and-goal.md) decision 1. The goal of 125 kB, the fixed-ceiling rule and decision 3 stay.
- **Tracking:** issue #2470 (entry chunk at its budget), PR #2474 (issue #2473)

## Context

On 2026-11-23 `dev` measured 139.8 kB of initial JavaScript locally (gzip level 9), and CI measures 100 to 270 B more than a local build. The P1 security fix #2473 (PR #2474: a tab that loaded under one account refuses every write after another tab signs in a different account, P-04, P-05) adds about 141 B to the first load. The minimum is about 80 B, because the guard must run before every write. PR #2474 was green except for this gate, at 140.1 kB.

The ticket for freeing room (#2470) measured the entry chunk. The sheets, achievements, AI client, news dialog and date libraries are not in it. It holds `react-dom`, `react-router`, `@tanstack/query-core`, the class-merge helper and about 68 kB (minified) of our own first-paint code. No safe lazy split frees 2 kB. Moving three skeletons out saved 267 B. The largest measured option, splitting the `shared/data` barrel across about 150 import sites, saves an estimated 2.4 to 4.3 kB and is a refactor, not a quick fix.

## Decision

1. **Hard limit: 142 kB gzipped.** `bundle.initialJsGzipBytes` in `app/config/gates/quality-limits.json` goes from 140,000 to 142,000.
2. **What the 2 kB buy:** the account guard of #2473 (a write sent or buffered only while the shared sign-in names the account the tab loaded), plus the CI-to-local measuring spread, so that a security fix of a few hundred bytes isn't blocked.
3. **It is still a fixed ceiling.** #2470 continues as measured cuts: first whether `react-router`'s server-only modules reach the entry, then the `shared/data` barrel split. When those free at least 2 kB, the owner decides in a PR of its own whether the ceiling returns to 140 kB.

## Alternatives

| Option                                       | Verdict                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Keep 140 kB; #2474 waits for #2470           | Rejected: no quick cut exists, and the security fix would wait for a refactor of about 150 files.                                         |
| Keep 140 kB; #2474 trims its own code        | Rejected: the minimum of about 80 B plus the CI spread of up to 270 B still fails, because `dev` already sits at the limit.               |
| Raise the limit further (for example 150 kB) | Rejected: ADR 0018 keeps the room small on purpose, so a misplaced library stays visible. 2 kB covers the guard and the measuring spread. |

## Consequences

- PR #2474 can merge once this PR is merged and `dev` is merged into its branch.
- The goal of 125 kB stays and is reported in every PR. `dev` is about 15 kB above it.
- QG-U6 in `18-architecture-and-quality-gates.md`, DS-08 and `app/tools/check/delivery/supply/README.md` name 142 kB and point here.
