import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { AchievementSettingsPostgres } from "./index.ts";

// US-ACH-08, P-04: calm mode per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let settings: AchievementSettingsPostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  settings = new AchievementSettingsPostgres(pool);
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

describe("US-ACH-08 calm mode per account", () => {
  it("US-ACH-08 has no row before the first change", async () => {
    expect(await settings.find(anna)).toBeNull();
  });

  it("US-ACH-08 stores and changes the switch, one row per account", async () => {
    expect(await settings.setCalmMode(anna, true)).toEqual({ calmMode: true });
    expect(await settings.find(anna)).toEqual({ calmMode: true });
    expect(await settings.setCalmMode(anna, false)).toEqual({ calmMode: false });
    expect(await settings.find(anna)).toEqual({ calmMode: false });
  });

  it("US-ACH-08 nobody sees or changes the setting of another account (P-04)", async () => {
    await settings.setCalmMode(anna, true);
    expect(await settings.find(ben)).toBeNull();
    await settings.setCalmMode(ben, false);
    expect(await settings.find(anna)).toEqual({ calmMode: true });
  });
});
