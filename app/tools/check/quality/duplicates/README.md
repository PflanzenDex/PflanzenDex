# Duplication gate (QG-K5)

Covers FR-QG-10 and US-QG-07 (an operations note; it lives here because `Docs/operations/` is at the five-unit limit LY-1). `make dup` measures the share of duplicated lines in `app/packages` with [jscpd](https://github.com/kucherenko/jscpd) (no server, no account). It is part of `make gates` and therefore of `make ci`; the CI job `ci` runs it through `make ci`, so `ci-status` covers it. QG-K4 (`make duplicates`, Fallow) stays: it blocks clone groups with three or more copies in changed files.

## Run it

```bash
make dup
```

The output names the measured percentage, the limit and the target. On failure it lists the five biggest clones.

## Limit and target

- Target (owner decision): at most 1 % duplicated lines.
- The limit is `dup.maxPercent` in `app/quality-limits.json`. It started at the measured value (1.65 %, measured on 2026-10-06, assumption) and only goes down, never up.
- `DUP-1`: the measured value is above the limit. Remove the clones; do not raise the limit.
- `DUP-2`: the measured value is more than `slackPercent` (0.1 points) below the limit. Lower `maxPercent` to the printed value in the same PR that removed clones. At 1 % the ratchet is finished.

## Lower the limit

1. Remove clones (the failure message names the biggest).
2. Run `make dup`; if it reports `DUP-2`, set `dup.maxPercent` to the printed value.
3. Commit both changes in one PR.

## Add an exception

Detection settings live in `app/.jscpd.json`. An ignore glob needs a reason; add it to the list below in the same PR and have a human review it (the file is a gate file, US-QG-07).

| Ignore glob                                          | Reason                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `**/node_modules/**`, `**/dist/**`, `**/coverage/**` | not source                                                                     |
| `**/*.test.*`, `**/*.selftest.*`, `packages/e2e/**`  | tests repeat setup on purpose and stay readable (QG-K4 excludes tests as well) |
| `**/*.d.ts`                                          | declarations, no logic                                                         |
| `**/*.stories.*`, `packages/web/.storybook/**`       | stories list variants of one component                                         |
| `**/fixtures.ts`, `**/*-test-helpers.ts`             | test support data                                                              |
| `packages/*/migrations/**`                           | applied SQL migrations are history and never edited                            |

Inline markers (`// jscpd:ignore-start`) are not used: exceptions live in the config, where review sees them.
