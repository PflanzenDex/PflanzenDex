import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { KeeperSwitchPostgres } from "./keeper-switch-store.ts";

// US-ONB-09, DM-ONB-04, P-04, P-05, P-10: the keeper's switches per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let store: KeeperSwitchPostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new KeeperSwitchPostgres(pool);
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

describe("US-ONB-09 keeper switches per account", () => {
  it("US-ONB-09 a feature without a row is on: a new account lists no switch", async () => {
    expect(await store.list(anna)).toEqual([]);
  });

  it("US-ONB-09 switching off stores the local date of the change and keeps the row", async () => {
    expect(await store.set(anna, "wishlist", false, "2026-11-06")).toEqual({
      feature: "wishlist",
      enabled: false,
      changedOn: "2026-11-06",
    });
    expect(await store.list(anna)).toEqual([
      { feature: "wishlist", enabled: false, changedOn: "2026-11-06" },
    ]);
  });

  it("US-ONB-09 repeating the same state keeps the date of the change", async () => {
    expect(await store.set(anna, "wishlist", false, "2026-11-09")).toEqual({
      feature: "wishlist",
      enabled: false,
      changedOn: "2026-11-06",
    });
  });

  it("US-ONB-09 switching on again stores the new state and the date of that change", async () => {
    expect(await store.set(anna, "wishlist", true, "2026-11-10")).toEqual({
      feature: "wishlist",
      enabled: true,
      changedOn: "2026-11-10",
    });
  });

  it("US-ONB-09 the switches of one account are not visible to another (P-04, P-05)", async () => {
    await store.set(anna, "ai_access", false, "2026-11-06");
    expect(await store.list(ben)).toEqual([]);
    expect(await store.set(ben, "ai_access", true, "2026-11-06")).toMatchObject({
      enabled: true,
    });
    expect((await store.list(anna)).find((r) => r.feature === "ai_access")).toMatchObject({
      enabled: false,
    });
  });

  it("US-ONB-09 the table refuses a feature id that is not a plain identifier (P-03, constraint in the database)", async () => {
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into account_keeper_switch (account_id, feature, enabled, changed_on) values ($1, 'Bad Name', false, '2026-11-06')",
          [anna],
        ),
      ),
    ).rejects.toThrow();
  });
});
