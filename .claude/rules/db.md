---
paths:
  - "app/packages/db/**"
---

# Rules for `packages/db` (PostgreSQL schema and access)

- Migrations in `packages/db/migrations/` are forward-only and checksummed. Never edit an applied migration file (a hook blocks it); add the next numbered file instead. Apply with `make migrate`.
- Schema changes follow expand/contract (US-DEV-07): add first, migrate data, remove in a later migration.
- Every user-related table has `account_id uuid not null references account(id) on delete cascade`, then `select tenant_protection('<table>');`, and an entry in `src/fixtures.ts`. Tables without an account need a justified entry in `WITHOUT_ACCOUNT_ID`. Otherwise the generic test `tenant.test.ts` fails (FR-ACC-02, P-04).
- Access only through `withAccount(pool, accountId, ...)`: transaction, role `pflanzendex_app` (no BYPASSRLS), `app.account_id` set per transaction. Never query tenant tables with a raw pool.
- Row-level security stays on; do not grant the app role more than needed. Roles are assigned administratively, never through the app.
- `db` is for `api` only: `core` and `web` never import it.
- DB tests need PostgreSQL 16 (`make db-up`, or `PFLANZENDEX_TEST_DATABASE_URL`). Test names carry story IDs.
- Documentation of the schema decisions goes into `app/README.md` (English), not into this file.
