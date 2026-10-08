---
paths:
  - "app/packages/core/**"
---

# Rules for `packages/core` (business logic)

- No I/O: no imports from API, web, db, the file system or the network (AB-1). Time, randomness and storage come in as parameters or ports.
- Pure functions. Derived data (care phase, "gefangen", trends) is computed on demand, never stored (P-01).
- Writes are operations defined with `defineOperation` and run through `execute` (P-03). Invalid input writes nothing.
- Domain errors carry a stable code `<domain>.<reason>` and a German user-facing text in `ERROR_TEXTS` (FR-QG-11). Never throw bare strings; never swallow errors (P-10).
- Unknown values stay unknown (shown as "unbekannt" in the UI), never an invented number (P-08).
- Cyclomatic complexity <= 10 and files <= 200 lines (`app/config/lint/eslint.config.js`); split instead of raising limits.
- Every directory with code has an `index.ts` as its public interface (ST-c); other packages import only `@pflanzendex/core`.
- Tests sit next to the code (`*.test.ts`), come from the acceptance criteria and carry the story ID in the name (P-06).
- Identifiers are English domain terms from the glossary (Species, Specimen, Light zone, ...); only the user-facing error texts are German.
