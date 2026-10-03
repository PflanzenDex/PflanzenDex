import type { Pool } from "pg";
import { FIXTURES_COLLECTION } from "./collection/index.ts";
import { FIXTURES_CATALOG } from "./catalog/index.ts";
import { FIXTURES_KERNEL, withAccount, type Fixtures } from "./kernel/index.ts";
import { FIXTURES_ACCOUNT } from "./account/index.ts";
import { FIXTURES_LIGHT } from "./light/index.ts";

// One example per table with an account id for the remaining columns (without the id, the test sets it).
// The entries live in their respective module; they are collected here. A new table without an entry
// makes the generic tenant test fail (FR-QG-07).
export const FIXTURES: Fixtures = {
  ...FIXTURES_KERNEL,
  ...FIXTURES_ACCOUNT,
  ...FIXTURES_CATALOG,
  ...FIXTURES_LIGHT,
  ...FIXTURES_COLLECTION,
};

// Test helpers for tables of another module (AB-9): tests of one module write no SQL on foreign tables,
// they call these helpers. Role assignment is the operator's job in operation (TE-08), not the application's.
export const assignRole = (pool: Pool, account: string, role: "operator" | "reviewer") =>
  pool.query("insert into account_role (account, role) values ($1, $2)", [account, role]);

/** The application role may neither read nor write the role table (both must fail with `permission denied`). */
export const readRoleTable = (pool: Pool, account: string) =>
  withAccount(pool, account, (c) => c.query("select * from account_role"));
export const writeInRoleTable = (pool: Pool, account: string) =>
  withAccount(pool, account, (c) =>
    c.query("insert into account_role (account, role) values ($1, 'operator')", [account]),
  );
