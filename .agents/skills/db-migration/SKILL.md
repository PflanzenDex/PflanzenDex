---
name: db-migration
description: Use when the database schema changes: a new table, column, index or constraint, also when tenant-isolation-test applies to the same table. Adds a forward-only numbered SQL migration that keeps the previous app version working, with tests and a fresh backup before production (US-DEV-07, NFR-15).
---

# Database migration

Migrations are forward-only SQL files applied by `migrate()` in `app/packages/db/src/kernel/migrate.ts`, each in its own transaction, in file name order, guarded by an advisory lock. The schema starts from the baseline `0001_baseline.sql` (issue 2519, d-122): the old chain 0001 to 0120 is deleted and only git history keeps it.

1. Create the file with `make migration NAME=<module>_<short_name>`: it takes the next number free on origin/dev, in every open PR branch and in reservations (`RESERVE_MIGRATION=1 make claim ISSUE=<n>` writes one into the Handoff). Format `NNNN_<module>_<short_name>.sql`, English snake case like `0002_light_example.sql`; the first line is `-- module: <module>`; the gate `make gates` fails on duplicate numbers or a new number not above origin/dev, then merge origin/dev and run `make migration` again for your file; start with a comment naming the story ID.
2. Never edit or rename an applied migration. Its SHA-256 checksum is stored in `schema_migrations`; a changed file makes `migrate()` throw "was changed after it was applied". Fix mistakes with a new migration.
3. Every file sets its own timeouts at the top: `set lock_timeout = '5s';` and `set statement_timeout = '...';` (d-121). The runner sets a lock timeout of 5 s anyway; the file's own value overrides it.
4. A statement that must run outside a transaction, such as `create index concurrently` on an existing table, goes into a file whose first lines hold `-- migrate: no-transaction`. The runner then runs the statements one by one. Such a file holds only statements that are safe to run again after a partial failure (`if not exists`); a failed concurrent index is left invalid and is dropped before the file runs again.
5. Run `make squawk` (squawk-cli pinned in `app/package.json`, also a step of `make gates`) over the migrations (rule set of d-121: default rules, `prefer-robust-stmts` off, PostgreSQL 18, every file in a transaction). A per-statement or per-line `-- squawk-ignore <rule>` needs a reason on the line above it.
6. Expand/contract: a migration must not break the previous app version (rollback, US-DEV-06). Add columns nullable or with a default, start using them in a later release, remove old columns only in a release after that. No rename in one step: add, copy, switch, drop.
7. New user table: apply the `tenant-isolation-test` skill (`account_id`, `select tenant_protection('…')`, fixture). A migration that drops a row rule fails the generic tenant test.
8. Put constraints into the database (`check`, `unique`, foreign keys), not only into core validation; core limits and SQL checks must match.
9. Test: `app/packages/db/src/kernel/migrate.test.ts` covers the mechanism; add a test next to the adapter that uses the new schema against real data. For data-moving migrations seed realistic rows first, migrate, then assert.
10. Apply locally with `make migrate` (uses `DATABASE_URL`, otherwise the test database from `make db-up`). Run it twice: the second run must apply nothing.
11. Before a migration runs in production: `make backup` (script `app/config/deploy/scripts/backup.sh`) and confirm it wrote a readable dump. Restore procedure: `docs/guides/operations/staging-deploy-and-backup.md`. `make restore-test` proves a dump restores.
12. A new table: update `app/packages/db/src/kernel/module-schema.test.ts` in the same PR. Its table owners and foreign keys across module boundaries (FR-QG-19) are listed by hand. Run the db suite locally before the push, not first in CI.

## Check

```bash
make migrate
make test
```

Expected: `make migrate` lists the new file once and nothing on a second run; `make test` is green including `migrate.test.ts` and `tenant.test.ts`.
