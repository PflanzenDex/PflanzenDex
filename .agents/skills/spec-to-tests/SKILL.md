---
name: spec-to-tests
description: Use when starting a story or requirement from Docs/PRODUCT-SPECS. Turns its Given/When/Then acceptance criteria into failing tests named with the story ID, before any implementation (P-06).
---

# Spec to tests

1. Read the story in `Docs/PRODUCT-SPECS/` (heading `### US-XXX-nn · …`) and every `FR-`/`DM-` entry it references. Note open decisions (`E-nn`); if one blocks the story, stop and report it (Definition of Ready, US-DEV-05).
2. List the acceptance criteria one by one. For each, decide the test level: pure domain rule → `app/packages/core` (Vitest, in-memory adapters such as `InMemoryIdempotencyStore`); tenant isolation or SQL → `app/packages/db` (real PostgreSQL); HTTP contract → `app/packages/api`; screen behavior → `app/packages/web`.
3. Write one `describe("US-XXX-nn <short title>")` per story and one `it(...)` per criterion. Add edge cases, error cases (expected `error_code` from `ERROR_TEXTS`) and the security path (another account must not see or change the data).
4. Test names and assertions use the English glossary terms of the spec (`Specimen`, `LightZone`, …), as the existing tests do.
5. Run the new tests and confirm they fail for the right reason (missing behavior, not a typo).
6. Only then implement, until they pass. Set the story to 🟨 in the spec while working, ✅ in the PR that completes it.

## Check

```bash
make test
```

Expected: the new `US-XXX-nn` tests are listed; before implementation they fail, afterwards everything passes.
