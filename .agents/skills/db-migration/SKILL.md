---
name: db-migration
description: Use when a story changes the database schema (new table, column, index, constraint). Adds a forward-only numbered SQL migration that keeps the previous app version working, with tests and a fresh backup before production (US-DEV-07, NFR-15).
---

# Database migration

Migrations are forward-only SQL files applied by `migrate()` in `app/packages/db/src/kernel/migrate.ts`, each in its own transaction, in file name order, guarded by an advisory lock.

1. Create the next number in `app/packages/db/migrations/` (look at the highest existing file; format `NNNN_<module>_<short_name>.sql`, English snake case like `0013_light_example.sql`; the first line is `-- module: <module>`). Start with a comment naming the story ID.
2. Never edit or rename an applied migration. Its SHA-256 checksum is stored in `schema_migrations`; a changed file makes `migrate()` throw "was changed after it was applied". Fix mistakes with a new migration.
3. Expand/contract: a migration must not break the previous app version (rollback, US-DEV-06). Add columns nullable or with a default, start using them in a later release, remove old columns only in a release after that. No rename in one step: add, copy, switch, drop.
4. New user table: apply the `tenant-isolation-test` skill (`account_id`, `select tenant_protection('…')`, fixture). A migration that drops a row rule fails the generic tenant test.
5. Put constraints into the database (`check`, `unique`, foreign keys), not only into core validation; core limits and SQL checks must match.
6. Test: `app/packages/db/src/kernel/migrate.test.ts` covers the mechanism; add a test next to the adapter that uses the new schema against real data. For data-moving migrations seed realistic rows first, migrate, then assert.
7. Apply locally with `make migrate` (uses `DATABASE_URL`, otherwise the test database from `make db-up`). Run it twice: the second run must apply nothing.
8. Before a migration runs in production: `make backup` (script `app/deploy/scripts/backup.sh`) and confirm it wrote a readable dump. Restore procedure: `docs/guides/operations/staging-deploy-and-backup.md`. `make restore-test` proves a dump restores.

## Check

```bash
make migrate
make test
```

Expected: `make migrate` lists the new file once and nothing on a second run; `make test` is green including `migrate.test.ts` and `tenant.test.ts`.
