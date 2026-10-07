# Story-to-test report (US-QS-02, US-QG-04)

`report-story-tests.mjs` prints a Markdown report and always exits 0 (owner decision 2026-10-07: report first, the gate decision stays with the owner). Run it with `node tools/check/quality/duplicates/story-tests/report-story-tests.mjs` from `app/`.

The blocking check for "every story with ✅ has a test naming its ID" already exists: `app/tools/check/docs/check-traceability.mjs` (`make spec-check`), for `US-` stories. This report adds numbers and covers requirements too.

## What it prints

- **Tests per ID:** for every story (`### US-…` heading) and requirement (`FR-`, `DM-`, `NFR-` table row) the spec marks ✅ or 🟨, the number of `describe`/`it`/`test` titles in `*.test.ts(x)`/`*.test.mjs` files that carry the ID (once per title). Done (✅) items with 0 tests are listed.
- **Pure-logic areas of US-QS-02, criterion 1:** for phase, rate, trend, light zone counting, prioritization, naming rule, rank, milestones, swap states and feed derivation, the source files in `app/packages/core/src` matched by path, their test files, test cases (`it`/`test`) and how many case titles name an ID. An area without source files reads "not yet"; it never fails.

## Limits

- The areas are matched by path (`AREAS` in the script). A renamed folder shows as "not yet" until the pattern is updated.
- A test counts for an ID only when the ID is in a title; an ID only in a comment or a file name does not count.
