---
name: add-core-operation
description: Use when a story needs a new write (create, change, delete) on domain data. Adds a validating operation in app/packages/core with schema, permission check, error codes, tests and the API route, following P-03 and KI-R1.
---

# Add a core operation

Writes never bypass the operations layer (P-03): the API, the UI and later the AI connection all call the same operation.

1. Pick the domain folder under `app/packages/core/src/<module>/` (e.g. `light/`; modules: `kernel`, `account`, `catalog`, `light`, ADR 0003), or create one with its own `index.ts` (rule ST-c). Name the operation `<domain>.<verb>` in German, as in `location.setUp`.
2. Define the input schema next to the domain (see `light/fields.ts`, helpers in `kernel/validation.ts`). Every field is validated; unknown fields are rejected.
3. Define the port (storage interface) in the domain's `types.ts`. `core` never imports a database or network module (AB-1); the adapter lives in `app/packages/db`.
4. Write the operation with `defineOperation({ name, schema, authorized?, run })` from `kernel/operation.ts`. Return domain failures as `failed(error("<domain>.<reason>"))`; never throw for expected cases.
5. Add every new error code with its German text to `ERROR_TEXTS` in `kernel/error.ts` (FR-QG-11). Codes are never renamed.
6. Export it from the module `index.ts` (the root `core/src/index.ts` re-exports every module).
7. Tests in `core` (use the `spec-to-tests` skill): valid input writes, invalid input writes nothing, another account gets `access.verweigert` or sees nothing, the same idempotency key does not write twice.
8. Database adapter in `app/packages/db` with tenant isolation (`account_id`, `tenant_protection()`, entry in `fixtures.ts`) so the generic tenant test covers the new table.
9. API route in `app/packages/api` that calls `execute(op, deps, { context, input, idempotencyKey })` with the `Idempotency-Key` header (see `api/src/light/light-routes.ts`).

## Check

```bash
make ci
```

Expected: boundary check without violations, the new tests named with the story ID pass, the tenant test (`tenant.test.ts`) passes.
