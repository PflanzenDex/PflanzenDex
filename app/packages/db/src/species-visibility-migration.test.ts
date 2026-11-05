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
  withAccount,
} from "./kernel/index.ts";
import { TEST_OWNER_ROLE, testOwnerUrl } from "./kernel/connection/connection.ts";

// Folders this file makes are removed after it, also when a test fails (#1278).
const madeDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

// NFR-12, issue #1235, US-DEV-07: migration 0102 copies the review status and creator of every existing species to the
// species row. A scratch database owned by the non-superuser owner role (as in production) is migrated up to 0101,
// filled with a case in every status, then migrated to the end. The copy must match the review case, and the row rules
// must give the same answers as before the migration.
const NEW = "0102_catalog_species_visibility.sql";
const DB = `visibility_${randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8)}`;
const [anna, ben, operator] = [randomUUID(), randomUUID(), randomUUID()];
let admin: pg.Pool;
let scratch: pg.Pool;
// Superuser connection to the scratch database: the owner's own reads are under row security (it sees approved cases
// only), so every count of the test that must see all rows goes through here.
let superUser: pg.Pool;
let applied: string[] = [];
const ids: Record<"target" | "open" | "reviewed" | "rejected" | "merged", string> = {
  target: randomUUID(),
  open: randomUUID(),
  reviewed: randomUUID(),
  rejected: randomUUID(),
  merged: randomUUID(),
};

/** Superuser connection to the scratch database: seeds rows through the guards, as the application would have. */
async function seed(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${DB}`;
  const su = openPool(url.toString());
  const client = await su.connect();
  try {
    await client.query("begin");
    for (const id of [anna, ben, operator])
      await client.query("insert into account (id) values ($1)", [id]);
    await client.query("insert into account_role (account, role) values ($1, 'operator')", [
      operator,
    ]);
    // The operator is the reviewer of the seed: its batch and its decisions pass the guards.
    await client.query("select set_config('app.account_id', $1, true)", [operator]);
    await client.query(
      "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'curated')",
      [operator, ids.target],
    );
    await client.query(
      `insert into species (id, created_by, latin_name, genus, difficulty, standard_level, light_demand_lux,
         growth_measure, etiolation_signs, success_criteria)
       values ($1, 'operator', 'Migra curata', 'Migra', 1, 2, 100, 'height', 'v', 'e')`,
      [ids.target],
    );
    const proposals: [keyof typeof ids, string][] = [
      ["open", anna],
      ["reviewed", anna],
      ["rejected", ben],
      ["merged", anna],
    ];
    for (const [key, creator] of proposals) {
      await client.query(
        "insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')",
        [creator, ids[key]],
      );
      await client.query(
        `insert into species (id, created_by, latin_name, genus, difficulty, standard_level, light_demand_lux,
           growth_measure, etiolation_signs, success_criteria)
         values ($1, 'user', $2, 'Migra', 1, 2, 100, 'height', 'v', 'e')`,
        [ids[key], `Migra ${key}`],
      );
    }
    await client.query("update review_case set status = 'reviewed' where object_id = $1", [
      ids.reviewed,
    ]);
    await client.query(
      "update review_case set status = 'rejected', reason = 'Doppelt' where object_id = $1",
      [ids.rejected],
    );
    await client.query(
      "update review_case set status = 'merged', merged_into = $2 where object_id = $1",
      [ids.merged, ids.target],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await su.end();
  }
}

beforeAll(async () => {
  admin = openAdminPool();
  await admin.query(`create database ${DB} owner ${TEST_OWNER_ROLE}`);
  const url = new URL(testOwnerUrl());
  url.pathname = `/${DB}`;
  scratch = openPool(url.toString());
  scratch.on("error", () => undefined);
  const su = new URL(testDatabaseUrl());
  su.pathname = `/${DB}`;
  superUser = openPool(su.toString());
  superUser.on("error", () => undefined);
  const before = tempDir("visibility-");
  for (const f of readdirSync(MIGRATIONS_DIRECTORY).filter((n) => n < NEW))
    copyFileSync(join(MIGRATIONS_DIRECTORY, f), join(before, f));
  await migrate(scratch, { directory: before });
  await seed();
  applied = await migrate(scratch);
}, 120_000);
afterAll(async () => {
  for (const dir of madeDirs) rmSync(dir, { recursive: true, force: true });
  await superUser.end();
  await scratch.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.end();
});

const seen = (user: string) =>
  withAccount(scratch, user, async (c) => {
    const r = await c.query<{ id: string }>("select id from species order by latin_name");
    return r.rows.map((x) => x.id).sort();
  });

describe("NFR-12 migration 0102 on a database with review cases in every status", () => {
  it("NFR-12 the new migration is the first to apply on the filled database, then every later one", () => {
    // Later migrations (e.g. 0103/0104, issue 1289) apply after it, as in a real deploy.
    const later = readdirSync(MIGRATIONS_DIRECTORY)
      .filter((n) => n.endsWith(".sql") && n >= NEW)
      .sort();
    expect(applied[0]).toBe(NEW);
    expect(applied).toEqual(later);
  });

  it("NFR-12 every species carries the status and creator of its review case, nothing is left out", async () => {
    const r = await superUser.query<{ mismatches: string; total: string }>(
      `select count(*) filter (where s.review_status is distinct from v.status
                                 or s.review_account is distinct from v.account_id) as mismatches,
              count(*) as total
         from species s join review_case v on v.object_kind = 'species' and v.object_id = s.id`,
    );
    expect(r.rows[0]).toEqual({ mismatches: "0", total: "5" });
    const rows = await superUser.query<{
      id: string;
      review_status: string;
      review_account: string;
    }>("select id, review_status, review_account from species");
    const byId = new Map(rows.rows.map((x) => [x.id, x] as const));
    expect(byId.get(ids.target)).toMatchObject({
      review_status: "curated",
      review_account: operator,
    });
    expect(byId.get(ids.open)).toMatchObject({ review_status: "proposal", review_account: anna });
    expect(byId.get(ids.reviewed)).toMatchObject({
      review_status: "reviewed",
      review_account: anna,
    });
    expect(byId.get(ids.rejected)).toMatchObject({
      review_status: "rejected",
      review_account: ben,
    });
    expect(byId.get(ids.merged)).toMatchObject({ review_status: "merged", review_account: anna });
  });

  it("NFR-12 the row rules after the copy match the rules before it", async () => {
    expect(await seen(anna)).toEqual([ids.target, ids.open, ids.reviewed].sort());
    expect(await seen(ben)).toEqual([ids.target, ids.reviewed, ids.rejected].sort());
    expect(await seen(operator)).toEqual([ids.target, ids.open, ids.reviewed].sort());
  });

  it("NFR-12 the migration is applied once: a second run applies nothing", async () => {
    expect(await migrate(scratch)).toEqual([]);
  });
});
