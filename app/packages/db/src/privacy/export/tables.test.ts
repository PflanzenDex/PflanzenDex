import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { migrate, openOwnerPool, WITHOUT_ACCOUNT_ID } from "../../kernel/index.ts";
import { CONTRIBUTED_TABLES } from "../../catalog/index.ts";
import { allTableNames, accountTables, NOT_EXPORTED, PHOTO_COLUMNS } from "./tables.ts";

let pool: Pool;
beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("US-ACC-04 every table is exported or has a reason not to be", () => {
  it("US-ACC-04 no table is neither exported, contributed, nor listed with a reason (guard for new tables)", async () => {
    const exported = new Set((await accountTables(pool)).map((t) => t.name));
    const forgotten = (await allTableNames(pool)).filter(
      (n) =>
        !exported.has(n) &&
        !(n in NOT_EXPORTED) &&
        !(n in CONTRIBUTED_TABLES) &&
        !(n in WITHOUT_ACCOUNT_ID),
    );
    expect(forgotten).toEqual([]);
  });

  it("US-ACC-04 every exception names a table that exists and gives a reason", async () => {
    const names = await allTableNames(pool);
    for (const [name, reason] of Object.entries(NOT_EXPORTED)) {
      expect(names, name).toContain(name);
      expect(reason.length, name).toBeGreaterThan(10);
    }
    for (const name of Object.keys(CONTRIBUTED_TABLES)) expect(names).toContain(name);
  });

  it("US-ACC-04 every photo column exists, and no other column looks like a stored photo", async () => {
    const r = await pool.query<{ t: string; c: string }>(
      `select table_name as t, column_name as c from information_schema.columns
        where table_schema = 'public' and data_type = 'text' and (column_name like '%photo%' or column_name like '%image_object%')`,
    );
    const found = r.rows.map((z) => `${z.t}.${z.c}`).sort();
    expect(found).toEqual(PHOTO_COLUMNS.map((p) => `${p.table}.${p.column}`).sort());
  });
});
