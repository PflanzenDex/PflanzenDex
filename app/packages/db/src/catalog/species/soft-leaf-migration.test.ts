import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  migrate,
  MIGRATIONS_DIRECTORY,
  openAdminPool,
  openPool,
  testDatabaseUrl,
} from "../../kernel/index.ts";

// US-LIC-01, DM-BES-01 (owner decision 2026-11-09): migration 0116 makes the soft-leaf flag nullable without a default
// and sets every stored false to unknown (null); only an explicit true stays. A scratch database is migrated up to
// 0115, filled with false, true and default rows, then migrated to the end.
const MIGRATION = "0116";
// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

const DB = `soft_leaf_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
let admin: pg.Pool;
let scratch: pg.Pool;

const uid = (n: number) => `e1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROWS = {
  no: uid(1),
  yes: uid(2),
  defaulted: uid(3),
} as const;

async function seed(db: pg.Pool) {
  const c = await db.connect();
  try {
    await c.query("begin");
    // The fixture writes species without the triggers of the review copy; the rows are plain catalog data here.
    await c.query("set local session_replication_role = replica");
    const insert = (id: string, name: string, softLeaf?: boolean) =>
      c.query(
        `insert into species (id, created_by, latin_name, genus, epithet, difficulty, standard_level, light_demand_lux,
           growth_measure, etiolation_signs, success_criteria, source, version${softLeaf === undefined ? "" : ", soft_leaf"})
         values ($1, 'operator', $2, 'Softleaf', $3, 2, 3, 8000, 'height', 'x', 'y', 'fixture', 1${softLeaf === undefined ? "" : ", $4"})`,
        softLeaf === undefined
          ? [id, name, name.toLowerCase()]
          : [id, name, name.toLowerCase(), softLeaf],
      );
    await insert(ROWS.no, "Softleaf no", false);
    await insert(ROWS.yes, "Softleaf yes", true);
    await insert(ROWS.defaulted, "Softleaf defaulted");
    await c.query("commit");
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}

async function softLeaf(id: string) {
  const r = await scratch.query<{ soft_leaf: boolean | null }>(
    "select soft_leaf from species where id = $1",
    [id],
  );
  return r.rows[0]?.soft_leaf;
}

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB}`);
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const before = tempDir("soft-leaf-");
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter((n) => n < MIGRATION))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(scratch, { directory: before });
  await seed(scratch);
  await migrate(scratch);
}, 120_000);

afterAll(async () => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
  await scratch.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

describe("US-LIC-01 migration 0116: soft leaf may be unknown (P-08, DM-BES-01)", () => {
  it("US-LIC-01: Given a species stored with soft leaf false, when migrated, then the flag is unknown (null)", async () => {
    expect(await softLeaf(ROWS.no)).toBeNull();
  });

  it("US-LIC-01: Given a species stored with soft leaf true, when migrated, then the flag stays true", async () => {
    expect(await softLeaf(ROWS.yes)).toBe(true);
  });

  it("US-LIC-01: Given a species that got the old default false, when migrated, then it is unknown too", async () => {
    expect(await softLeaf(ROWS.defaulted)).toBeNull();
  });

  it("US-LIC-01: Given the migrated schema, then the column is nullable and has no default", async () => {
    const r = await scratch.query<{ is_nullable: string; column_default: string | null }>(
      `select is_nullable, column_default from information_schema.columns
        where table_schema = current_schema() and table_name = 'species' and column_name = 'soft_leaf'`,
    );
    expect(r.rows[0]).toEqual({ is_nullable: "YES", column_default: null });
  });

  it("US-LIC-01: Given the migrated schema, then a new species without a soft leaf answer stores unknown (null)", async () => {
    const c = await scratch.connect();
    try {
      await c.query("begin");
      await c.query("set local session_replication_role = replica");
      await c.query(
        `insert into species (id, created_by, latin_name, genus, epithet, growth_measure, etiolation_signs,
           success_criteria, source, version)
         values ($1, 'operator', 'Softleaf fresh', 'Softleaf', 'fresh', 'height', 'x', 'y', 'fixture', 1)`,
        [uid(4)],
      );
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
    expect(await softLeaf(uid(4))).toBeNull();
  });
});
