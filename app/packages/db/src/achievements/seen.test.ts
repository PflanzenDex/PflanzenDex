import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { AchievementSeenPostgres } from "./index.ts";

// US-ACH-03, P-04: the seen state per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let seen: AchievementSeenPostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  seen = new AchievementSeenPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) =>
      c.query("insert into account (id) values ($1) on conflict do nothing", [id]),
    );
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

describe("US-ACH-03 seen state per account", () => {
  it("US-ACH-03 has no state before the first write", async () => {
    expect(await seen.find(anna)).toBeNull();
  });

  it("US-ACH-03 creates the state, only grows, and stores no id twice", async () => {
    expect(await seen.add(anna, ["a", "a", "b"], ["a", "b"])).toEqual({
      seen: ["a", "b"],
      known: ["a", "b"],
    });
    const next = await seen.add(anna, ["b", "c"], ["c"]);
    expect([...next.seen].sort()).toEqual(["a", "b", "c"]);
    expect([...next.known].sort()).toEqual(["a", "b", "c"]);
    const again = await seen.add(anna, [], []);
    expect([...again.seen].sort()).toEqual(["a", "b", "c"]);
  });

  it("US-ACH-03 an empty first write still creates the state (marker of the first evaluation)", async () => {
    expect(await seen.add(ben, [], [])).toEqual({ seen: [], known: [] });
    expect(await seen.find(ben)).toEqual({ seen: [], known: [] });
  });

  it("US-ACH-03 nobody sees or changes the state of another account (P-04)", async () => {
    const before = await seen.find(anna);
    await seen.add(ben, ["z"], ["z"]);
    expect(await seen.find(anna)).toEqual(before);
    expect((await seen.find(ben))?.seen).toEqual(["z"]);
  });
});
