import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool, testDatabaseUrl, withAccount } from "../kernel/index.ts";
import { assignRole } from "../fixtures.ts";

// US-BES-10, FR-BES-11, P-10: the lock that a merge takes on the proposal's species row must be real when the owner
// of the tables is NOT a superuser (a superuser bypasses row security, so the normal suite cannot see this). The
// test migrates a scratch database as a non-superuser owner and calls the function as the real application role.
const run = randomUUID()
  .replace(/[0-9-]/g, "")
  .slice(0, 8);
const OWNER = `lock_owner_${run}`;
const DB = `lock_rls_${run}`;
const [keeper, reviewer, other] = [randomUUID(), randomUUID(), randomUUID()];
const speciesId = randomUUID();
let admin: pg.Pool;
let owner: pg.Pool;

function scratchUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.username = OWNER;
  url.password = "lock";
  url.pathname = `/${DB}`;
  return url.toString();
}

beforeAll(async () => {
  admin = openPool();
  await migrate(admin); // makes sure the application role exists (cluster-wide)
  await admin.query(`create role ${OWNER} login nosuperuser password 'lock'`);
  await admin.query(`grant pflanzendex_app to ${OWNER} with admin option`);
  await admin.query(`create database ${DB} owner ${OWNER}`);
  owner = openPool(scratchUrl());
  // Idle clients may be cut off when the scratch database is dropped; that is expected, not an error of the test.
  owner.on("error", () => undefined);
  await migrate(owner);
  for (const id of [keeper, reviewer, other])
    await withAccount(owner, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  await assignRole(owner, reviewer, "reviewer");
  await withAccount(owner, keeper, async (c) => {
    await c.query(
      `insert into review_case (account_id, object_kind, object_id, status) values ($1, 'species', $2, 'proposal')`,
      [keeper, speciesId],
    );
    await c.query(
      `insert into species (id, genus, latin_name, difficulty, standard_level, light_demand_lux,
         growth_measure, etiolation_signs, success_criteria, created_by)
       values ($1, 'Lockus', 'Lockus rls', 1, 2, 100, 'height', 'v', 'e', 'user')`,
      [speciesId],
    );
  });
});
afterAll(async () => {
  await owner.end();
  await admin.query(`drop database if exists ${DB} with (force)`);
  await admin.query(`drop role if exists ${OWNER}`);
  await admin.end();
});

describe("US-BES-10 the merge lock is real under row security (non-superuser owner)", () => {
  it("US-BES-10 the owner of this scratch database is not a superuser", async () => {
    const r = await owner.query<{ s: boolean }>(
      "select rolsuper as s from pg_roles where rolname = current_user",
    );
    expect(r.rows[0]?.s).toBe(false);
  });

  it("US-BES-10 while a reviewer holds the lock, a write of the creator that references the species waits", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked: (v: boolean) => void = () => undefined;
    const lockedSignal = new Promise<boolean>((resolve) => (locked = resolve));
    const holding = withAccount(owner, reviewer, async (c) => {
      const r = await c.query<{ ok: boolean }>("select lock_species_for_merge($1) as ok", [
        speciesId,
      ]);
      locked(r.rows[0]?.ok === true);
      await gate;
    });
    expect(await lockedSignal).toBe(true);
    const blocked = withAccount(owner, keeper, async (c) => {
      await c.query("set local lock_timeout = '300ms'");
      await c.query(
        `insert into species_name (species_id, field, display, norm)
         values ($1, 'german', 'Wartet', 'wartet')`,
        [speciesId],
      );
    });
    await expect(blocked).rejects.toMatchObject({ code: "55P03" });
    release();
    await holding;
  });

  it("US-BES-10 a species that cannot be locked (unknown, or not visible) answers false instead of silently locking nothing", async () => {
    const r = await withAccount(owner, reviewer, (c) =>
      c.query<{ ok: boolean }>("select lock_species_for_merge($1) as ok", [randomUUID()]),
    );
    expect(r.rows[0]?.ok).toBe(false);
  });

  it("US-BES-10 only reviewers lock; reviewers read open proposals, other keepers do not (non-superuser owner)", async () => {
    await expect(
      withAccount(owner, other, (c) => c.query("select lock_species_for_merge($1)", [speciesId])),
    ).rejects.toMatchObject({ code: "42501" });
    const count = (user: string) =>
      withAccount(owner, user, (c) => c.query("select 1 from species where id = $1", [speciesId]));
    expect((await count(reviewer)).rowCount).toBe(1);
    expect((await count(keeper)).rowCount).toBe(1);
    expect((await count(other)).rowCount).toBe(0);
  });

  it("US-BES-10 the status helpers reveal nothing about foreign species to other accounts", async () => {
    const ask = (user: string, fn: string) =>
      withAccount(owner, user, (c) =>
        c.query<{ v: boolean }>(`select ${fn}($1) as v`, [speciesId]),
      );
    expect((await ask(other, "is_open_proposal")).rows[0]?.v).toBe(false);
    expect((await ask(reviewer, "is_open_proposal")).rows[0]?.v).toBe(true);
    expect((await ask(other, "species_is_merged")).rows[0]?.v).toBe(false);
  });
});
