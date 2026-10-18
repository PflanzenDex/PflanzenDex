import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { KeeperStylePostgres } from "./index.ts";

// US-ONB-03, DM-ONB-01, P-04, FR-ONB-06: keeper style per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let store: KeeperStylePostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new KeeperStylePostgres(pool);
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

describe("US-ONB-03 keeper style per account", () => {
  it("US-ONB-03 a new account has no row (it counts as few), the choice is one row that can change", async () => {
    expect(await store.find(anna)).toBeNull();
    expect(await store.set(anna, "few", "2026-10-18")).toEqual({
      style: "few",
      chosenOn: "2026-10-18",
    });
    expect(await store.set(anna, "many", "2026-10-20")).toEqual({
      style: "many",
      chosenOn: "2026-10-20",
    });
    expect(await store.find(anna)).toEqual({ style: "many", chosenOn: "2026-10-20" });
  });

  it("US-ONB-03 nobody sees or changes the style of another account (P-04, QG-D1)", async () => {
    await store.set(anna, "many", "2026-10-18");
    expect(await store.find(ben)).toBeNull();
    await store.set(ben, "few", "2026-10-19");
    expect(await store.find(anna)).toEqual({ style: "many", chosenOn: "2026-10-18" });
  });

  it("US-ONB-03 the database refuses a style other than few and many", async () => {
    await expect(store.set(anna, "expert" as "few", "2026-10-18")).rejects.toThrow();
  });

  it("FR-ONB-06 the migration set the accounts that existed to many", async () => {
    const migration = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../../../migrations/0081_account_style.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(migration).toMatch(/insert into account_style[^;]*'many'[^;]*from account/);
  });
});
