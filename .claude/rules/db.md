---
paths:
  - "app/packages/db/**"
---

# Rules for `packages/db` (PostgreSQL schema and access)

- The schema starts from one baseline, `packages/db/migrations/0001_baseline.sql` (issue 2519, d-122). The chain 0001 to 0120 is deleted; git history keeps it. Every later migration is forward-only and checksummed: never edit an applied migration file (a hook blocks it); add the next numbered file instead. Apply with `make migrate`.
- Every migration file sets its own `set lock_timeout = '...';` and `set statement_timeout = '...';` (d-121). The runner sets a lock timeout of 5 s for every file anyway.
- A migration that must run outside a transaction (`create index concurrently`) starts with the marker `-- migrate: no-transaction` in its first lines. Such a file holds only statements that are safe to run again after a partial failure (`if not exists`); a failed concurrent index is left invalid and must be dropped before the file runs again.
- Migrations are checked with squawk (rule set of d-121: default rules, `prefer-robust-stmts` off, PostgreSQL 18, every file a transaction). A per-statement `-- squawk-ignore <rule>` needs a reason on the line above.
- Schema changes follow expand/contract (US-DEV-07): add first, migrate data, remove in a later migration.
- Every user-related table has `account_id uuid not null references account(id) on delete cascade`, then `select tenant_protection('<table>');`, and an entry in `src/fixtures.ts`. Tables without an account need a justified entry in `WITHOUT_ACCOUNT_ID`. Otherwise the generic test `tenant.test.ts` fails (FR-ACC-02, P-04).
- Access only through `withAccount(pool, accountId, ...)`: transaction, role `pflanzendex_app` (no BYPASSRLS), `app.account_id` set per transaction. Never query tenant tables with a raw pool.
- Row-level security stays on; do not grant the app role more than needed. Roles are assigned administratively, never through the app.
- `db` is for `api` only: `core` and `web` never import it.
- DB tests need PostgreSQL 18 (`make db-up`, or `PFLANZENDEX_TEST_DATABASE_URL`). Test names carry story IDs.
- Documentation of the schema decisions goes into `docs/guides/reference/app.md` (English), not into this file.
