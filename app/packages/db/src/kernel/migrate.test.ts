import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "./migrate.ts";
import { openPool } from "./connection.ts";

const TABLE_NAME = "schema_migrations_test";
let pool: Pool;

beforeAll(() => {
  pool = openPool();
});
afterAll(async () => {
  await pool.query(`drop table if exists ${TABLE_NAME}`);
  await pool.end();
});

function directory(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "migr-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("migration tool", () => {
  it("applies files in name order once and remembers them", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({ "0002_b.sql": "select 2;", "0001_a.sql": "select 1;" });
    expect(await migrate(pool, { directory: dir, tableName: TABLE_NAME })).toEqual([
      "0001_a.sql",
      "0002_b.sql",
    ]);
    expect(await migrate(pool, { directory: dir, tableName: TABLE_NAME })).toEqual([]);
  });

  it("aborts if an already applied migration was changed afterwards", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({ "0001_a.sql": "select 1;" });
    await migrate(pool, { directory: dir, tableName: TABLE_NAME });
    writeFileSync(join(dir, "0001_a.sql"), "select 99;");
    await expect(migrate(pool, { directory: dir, tableName: TABLE_NAME })).rejects.toThrow(
      /0001_a\.sql.*changed/,
    );
  });

  it("rolls back a faulty migration completely and leaves nothing half-applied", async () => {
    await pool.query(`drop table if exists ${TABLE_NAME}`);
    const dir = directory({
      "0001_kaputt.sql": "create table halb (id int); select not_present();",
    });
    await expect(migrate(pool, { directory: dir, tableName: TABLE_NAME })).rejects.toThrow();
    const r = await pool.query("select to_regclass('halb') as t");
    expect(r.rows[0].t).toBeNull();
  });
});
