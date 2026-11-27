# Migration squash: the baseline `0001_baseline.sql` (issue 2519)

Owner decisions: d-122 (squash 0001 to 0120, reset every database), d-121 (lock timeout, no-transaction marker, squawk rule
set), d-130 (old files deleted, baseline named `0001_baseline.sql`). This record proves that the baseline builds the same schema
and the same reference rows as the chain, and that squawk passes on it.

## Method

1. **Chain database.** A scratch database `old_2519` on the test cluster of the worktree was migrated by the chain (119 files,
   `DATABASE_URL=<scratch> npm run migrate -w @pflanzendex/db`, exit 0).
2. **Chain dumps.** `pg_dump --schema-only --no-owner --exclude-table=schema_migrations` (6,748 lines) and
   `pg_dump --data-only --exclude-table=schema_migrations`. The chain leaves two rows in the whole database: `access_setting`
   (migration 0018, `insert ... default values`) and `operator_cost` (0021). The other 56 tables are empty.
3. **Baseline.** Written from the schema dump by a script (kept outside the repository): 58 tables, 62 functions, 76 row rules,
   86 indexes, 91 foreign keys, 99 grants, 6 triggers. Layout: roles, functions, then per module its tables with constraints,
   indexes, row security, triggers and grants, the foreign keys in the chain's creation order, the row rules. Row rules bound to
   the owner (17) are written `to current_user`, as migration 0094 left them. Four checks written with `between` in the chain
   are written that way too (PostgreSQL stores that shape differently from the same text in explicit parentheses).
4. **Fresh database from the baseline alone.** `psql -v ON_ERROR_STOP=1 -d new_2519 -f app/packages/db/migrations/0001_baseline.sql`,
   exit 0. The reference rows are inserted right after their tables, before row security is switched on, as the chain did.
5. **Dumps of the baseline database** with the same flags as in step 2 (`--schema-only`, `--data-only`, `--exclude-table=schema_migrations`).
6. **Catalog listing** (`pg_constraint`, `pg_indexes`, `pg_policies`, row security flags, `pg_trigger`, routines with
   `prosecdef`, `proconfig`, volatility and `md5(prosrc)`, `information_schema.role_table_grants` and `role_routine_grants`,
   columns with type, default, not null, identity and generated, `pg_description`, types, extensions, relation count).

## Normalisation (the only changes made to either side)

- The `\restrict` / `\unrestrict` key that psql writes into each dump is dropped (it is random per dump).
- **NOT NULL names.** The chain gave 56 NOT NULL constraints German names (`konto_id_not_null`, `messung_wert_not_null`, ...).
  The baseline lets PostgreSQL name them `<table>_<column>_not_null`. On the old side each name is shown with that default. The
  list comes from the chain database:

  ```sql
  select c.relname, a.attname, k.conname, c.relname || '_' || a.attname || '_not_null' as default_name
    from pg_constraint k join pg_class c on c.oid = k.conrelid
    join pg_attribute a on a.attrelid = c.oid and a.attnum = k.conkey[1]
   where k.contype = 'n' and k.conname <> c.relname || '_' || a.attname || '_not_null';
  ```

  The count is 56, and the proof checks that every one of them is replaced.
- **Timestamps.** The two reference rows carry `now()` of their insert; the timestamps are masked (`TIMESTAMP`) in the data dumps.
- **Table order of the data dump.** `pg_dump` orders the table blocks by the foreign-key graph, which differs between the two
  databases; the blocks are sorted by table name before the diff. Their content is not changed.
- **`schema_migrations`** is the runner's bookkeeping table. It is left out of every comparison.

## Result

The diff commands, run on the normalised files (the normalisation and the sorting were done by small scripts, not kept in the
repository; their rules are listed above):

```bash
diff chain-schema.norm.sql baseline-schema.norm.sql; echo "exit=$?"     # exit=0, no output
diff chain-data.sorted.sql baseline-data.sorted.sql; echo "exit=$?"     # exit=0, no output
diff chain-catalog.norm.txt baseline-catalog.norm.txt; echo "exit=$?"   # exit=0, no output
```

Result: schema diff exit 0, data diff exit 0, catalog diff exit 0. No difference is left after the normalisation above.

Restrict triggers of `species`: the chain fires `specimen_species` first, the baseline does too (`RI_ConstraintTrigger_a_<oid>`
names are sorted by constraint OID, so the foreign keys are created in the chain's order). A delete of a species in use
names the same constraint as before (`specimens.test.ts`).

## squawk

Command (squawk-cli 2.74.0, run with `npx --yes` from a scratch directory outside the repository, not added to any manifest):

```bash
npx --yes squawk-cli@2.74.0 --pg-version 18 --assume-in-transaction --exclude prefer-robust-stmts --reporter gcc app/packages/db/migrations/0001_baseline.sql
```

Output: none; exit code 0.

- `--assume-in-transaction` matches the runner, which runs each file in a transaction. Without it, squawk reports 91
  `constraint-missing-not-valid` and 91 `adding-foreign-key-constraint` (the foreign keys), 86 `require-concurrent-index-creation`
  (the indexes), 58 `adding-serial-primary-key-field` and 16 `disallowed-unique-constraint` on the tables this file creates.
- `require-lock-timeout` and `require-statement-timeout` are on by default. Control: a file with the same statements and no
  `set` lines exits 1 with both warnings (`control-squawk` run, same command).
- `prefer-robust-stmts` is excluded (d-121).
- 25 integer columns (counts, versions, small scores: `prefer-bigint-over-int`, `prefer-bigint-over-smallint`) keep their type,
  so that the schema stays equal. Each carries a `-- squawk-ignore <rule>` line on the line above it, and the table has a reason
  line above it. squawk reads a column warning only from the ignore directly above the column line.
- The rule set as a config file (draft for `app/config/lint/squawk.toml`, owner merges): `excluded_rules = ["prefer-robust-stmts"]`,
  `assume_in_transaction = true`, `pg_version = "18"`. Checked: with `--config`, the baseline exits 0 and the control exits 1.
