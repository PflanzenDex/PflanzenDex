import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { findSchemaViolations } from "../schema-check.ts";
import { AccountFeaturesPostgres } from "./index.ts";

// US-DEV-06, P-04: per-account feature switches against a real PostgreSQL (`make db-up`).
let pool: Pool;
let admin: Pool;
let store: AccountFeaturesPostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new AccountFeaturesPostgres(pool);
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

describe("US-DEV-06 per-account feature switches", () => {
  it("US-DEV-06 an account without a row has every function off", async () => {
    expect(await store.find(anna)).toEqual([]);
  });

  it("US-DEV-06 two accounts: each sees only its own switches", async () => {
    await admin.query(
      "insert into account_feature (account, feature) values ($1, 'social'), ($1, 'ai'), ($2, 'recommendations')",
      [anna, ben],
    );
    expect(await store.find(anna)).toEqual(["ai", "social"]);
    expect(await store.find(ben)).toEqual(["recommendations"]);
  });

  it("US-DEV-06 the application cannot read or write the table, so no account opens a function itself", async () => {
    await expect(
      withAccount(pool, anna, (c) => c.query("select * from account_feature")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withAccount(pool, ben, (c) =>
        c.query("insert into account_feature (account, feature) values ($1, 'social')", [ben]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("US-DEV-06 switching off deletes the row only, the schema check stays green", async () => {
    await admin.query("delete from account_feature where account = $1", [anna]);
    expect(await store.find(anna)).toEqual([]);
    expect(await findSchemaViolations(admin)).toEqual([]);
  });
});
