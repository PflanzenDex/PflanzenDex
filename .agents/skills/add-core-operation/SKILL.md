---
name: add-core-operation
description: Use when keepers or operators must be able to create, change, move, archive or delete something (a specimen, wish, measurement, zone …), that is any new write on domain data. Adds a validating operation in app/packages/core with schema, permission check, error codes, tests and the API route, following P-03 and KI-R1.
---

# Add a core operation

Writes never bypass the operations layer (P-03): the API, the UI and later the AI connection all call the same operation.

1. Pick the domain folder under `app/packages/core/src/<module>/` (e.g. `light/`; modules: `kernel`, `account`, `catalog`, `light`, ADR 0003), or create one with its own `index.ts` (rule ST-c). Name the operation `<domain>.<verb>` in English, as in `location.setUp`.
2. Define the input schema next to the domain (see `light/fields.ts`, helpers in `kernel/input/validation.ts`). Every field is validated; `shape()` drops unknown fields at runtime, and the JSON Schema it publishes for the MCP tools (US-KI-07) refuses them.
3. Define the port (storage interface) in the domain's `types.ts`. `core` never imports a database or network module (AB-1); the adapter lives in `app/packages/db`.
4. Write the operation with `defineOperation({ name, schema, authorized?, run })` from `kernel/operation.ts`. Return domain failures as `failed(appError("<domain>.<reason>"))`; never throw for expected cases.
5. Add every new error code with its German text to `ERROR_TEXTS` in `kernel/error.ts` (FR-QG-11). Codes are never renamed.
6. Export it from the module `index.ts` (the root `core/src/index.ts` re-exports every module).
7. Tests in `core` (use the `spec-to-tests` skill): valid input writes, invalid input writes nothing, another account gets `access.denied` or sees nothing, the same idempotency key does not write twice.
8. Database adapter in `app/packages/db` with tenant isolation (`account_id`, `tenant_protection()`, entry in `fixtures.ts`) so the generic tenant test covers the new table.
9. API route in `app/packages/api` that calls `execute(op, deps, { context, input, idempotencyKey })` with the `Idempotency-Key` header (see `api/src/light/light-routes.ts`).
10. Name the operation (`domain.verb`) and the route (`METHOD /path`) in the section of the story in `docs/guides/reference/app.md`; `make reference-check` fails otherwise (US-QG-10).
11. A new GET route is measured only once it is listed in `app/packages/api/src/query-count-endpoints.ts`, which the query-count test reads. A new screen needs `make one-screen SCREEN=<id>`. The route list is kept by hand, and CI repeats the screen check: update the list and run both locally before the push.

## Check

```bash
make ci
```

Expected: boundary check without violations, the new tests named with the story ID pass, the tenant test (`tenant.test.ts`) passes. Gates that often bite a new operation: at most 60 lines per function (`app/config/gates/quality-limits.json`; mount a module's routes in its own `bind<Module>` function, as `bindEquipment` does, instead of growing `api/src/app.ts`), literals that the constants gate wants as named constants (FR-QG-12), and knip on an export nothing imports.
