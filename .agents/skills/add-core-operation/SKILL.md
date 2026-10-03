---
name: add-core-operation
description: Use when a story needs a new write (create, change, delete) on domain data. Adds a validating operation in app/packages/core with schema, permission check, error codes, tests and the API route, following P-03 and KI-R1.
---

# Add a core operation

Writes never bypass the operations layer (P-03): the API, the UI and later the AI connection all call the same operation.

1. Pick the domain folder under `app/packages/core/src/<module>/` (e.g. `licht/`; modules: `kern`, `konto`, `katalog`, `licht`, ADR 0003), or create one with its own `index.ts` (rule ST-c). Name the operation `<domain>.<verb>` in German, as in `standort.einrichten`.
2. Define the input schema next to the domain (see `licht/felder.ts`, helpers in `kern/validierung.ts`). Every field is validated; unknown fields are rejected.
3. Define the port (storage interface) in the domain's `typen.ts`. `core` never imports a database or network module (AB-1); the adapter lives in `app/packages/db`.
4. Write the operation with `definiereOperation({ name, schema, berechtigt?, ausfuehren })` from `kern/operation.ts`. Return domain failures as `fehlgeschlagen(fehler("<domain>.<reason>"))`; never throw for expected cases.
5. Add every new error code with its German text to `FEHLERTEXTE` in `kern/fehler.ts` (FR-QG-11). Codes are never renamed.
6. Export it from the module `index.ts` (the root `core/src/index.ts` re-exports every module).
7. Tests in `core` (use the `spec-to-tests` skill): valid input writes, invalid input writes nothing, another account gets `zugriff.verweigert` or sees nothing, the same idempotency key does not write twice.
8. Database adapter in `app/packages/db` with tenant isolation (`konto_id`, `mandantenschutz()`, entry in `fixtures.ts`) so the generic tenant test covers the new table.
9. API route in `app/packages/api` that calls `fuehreAus(op, deps, { kontext, eingabe, idempotenzSchluessel })` with the `Idempotency-Key` header (see `api/src/licht/licht-routen.ts`).

## Check

```bash
make ci
```

Expected: boundary check without violations, the new tests named with the story ID pass, the tenant test (`mandant.test.ts`) passes.
