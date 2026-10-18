import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { ManualUnlockPostgres } from "./index.ts";

// US-ONB-05, DM-ONB-02, P-04: manual unlocks per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let store: ManualUnlockPostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new ManualUnlockPostgres(pool);
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

describe("US-ONB-05 manual unlock per account", () => {
  it("US-ONB-05 stores the unlock once, the first date stays", async () => {
    expect(await store.add(anna, "wishlist", "2026-10-01")).toEqual({
      id: "wishlist",
      unlockedOn: "2026-10-01",
    });
    expect(await store.add(anna, "wishlist", "2026-10-09")).toEqual({
      id: "wishlist",
      unlockedOn: "2026-10-01",
    });
    expect(await store.list(anna)).toEqual([{ id: "wishlist", unlockedOn: "2026-10-01" }]);
  });

  it("US-ONB-05 nobody sees or changes the unlocks of another account (P-04, QG-D1)", async () => {
    await store.add(anna, "discover", "2026-10-02");
    expect(await store.list(ben)).toEqual([]);
    await store.add(ben, "discover", "2026-10-05");
    expect(await store.list(anna)).toContainEqual({ id: "discover", unlockedOn: "2026-10-02" });
    expect(await store.list(ben)).toEqual([{ id: "discover", unlockedOn: "2026-10-05" }]);
  });
});
