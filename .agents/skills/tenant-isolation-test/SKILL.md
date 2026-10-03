---
name: tenant-isolation-test
description: Use when adding or changing a table that holds user-owned data, or an operation that reads or writes it. Gives the table tenant isolation (konto_id, row rule, fixture) and proves with two accounts that nobody sees or changes foreign data (QG-D1, NFR-09, FR-QG-07).
---

# Tenant isolation test

Every table with user data carries `konto_id` and an enforced row rule (P-04, P-05). A forgotten table must fail a test, not leak in production.

1. In the migration (skill `db-migration`) add `konto_id uuid not null references konto(id) on delete cascade` and, directly after the table, `select mandantenschutz('<table>');` (defined in `app/packages/db/migrations/0001_mandantengrundlage.sql`, used e.g. in `app/packages/db/migrations/0004_lichtzonen_standorte.sql`). Catalog tables shared by all accounts are the only exception and need an explicit decision in `Docs/PRODUKT-SPECS/16-Releases-und-Entscheidungen.md`.
2. References between two user tables use a composite foreign key `(konto_id, id)` so a row can never point at a foreign account's row (see `standort` -> `lichtzone` in `app/packages/db/migrations/0004_lichtzonen_standorte.sql`).
3. Add one entry to `FIXTURES` in `app/packages/db/src/fixtures.ts`: a function returning example values for the remaining columns, without `konto_id` (the test sets it). Without the entry the generic test fails by design.
4. Do not write a table-specific isolation test. The generic tests in `app/packages/db/src/mandant.test.ts` (`pruefeMandantentrennung`, `findeSchemaVerstoesse` from `app/packages/db/src/trennung.ts`) cover read and change across accounts and report tables without `konto_id` or without a forced row rule.
5. All application queries run through `mitKonto(pool, kontoId, fn)` (`app/packages/db/src/mandant.ts`), which sets the account per transaction. Never query user tables on a bare pool connection.
6. Operation level (use the `spec-to-tests` skill): a test with two accounts where account B calls the operation on account A's object and gets `zugriff.verweigert` or `<domain>.nicht_gefunden`, and nothing changed. In the API package, assert the same through HTTP (403 or 404, see `app/packages/api/src/fehler-http.ts`).
7. Existence must not leak: for foreign ids answer exactly like for missing ids (`nicht_gefunden`) unless the spec says otherwise.

## Check

```bash
make test
```

Expected: `mandant.test.ts` passes ("Mandantentrennung über alle Tabellen") and lists no problems; without Docker locally, the database tests run only in CI (`make ci`).
