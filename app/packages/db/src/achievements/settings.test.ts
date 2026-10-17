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

describe("US-ACH-04 pauses of the care rhythm per account", () => {
  it("US-ACH-04 stores, lists and removes a pause as local dates, only for the own account (P-04)", async () => {
    const added = await settings.addPause(anna, { from: "2026-07-01", until: "2026-07-14" });
    expect(added).toMatchObject({ from: "2026-07-01", until: "2026-07-14" });
    expect(await settings.listPauses(anna)).toEqual([added]);
    expect(await settings.listPauses(ben)).toEqual([]);
    expect(await settings.removePause(ben, added.id)).toBe(false);
    expect(await settings.removePause(anna, added.id)).toBe(true);
    expect(await settings.listPauses(anna)).toEqual([]);
  });

  it("US-ACH-04 the database refuses a pause longer than 28 days or ending before it starts", async () => {
    await expect(
      settings.addPause(anna, { from: "2026-07-01", until: "2026-07-29" }),
    ).rejects.toThrow();
    await expect(
      settings.addPause(anna, { from: "2026-07-10", until: "2026-07-09" }),
    ).rejects.toThrow();
  });
});
