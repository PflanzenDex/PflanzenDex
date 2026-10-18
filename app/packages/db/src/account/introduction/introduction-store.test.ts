import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignRole, createFixtureSpecimen } from "../../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { IntroductionPostgres } from "./index.ts";

// US-ONB-08, P-04, P-05: the figures of the introduction for the operator (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let store: IntroductionPostgres;
const operator = randomUUID();
const keeper = randomUUID();
const ids = [operator, keeper, ...Array.from({ length: 6 }, () => randomUUID())];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  store = new IntroductionPostgres(pool);
  for (const id of ids)
    await withAccount(pool, id, (c) =>
      c.query("insert into account (id) values ($1) on conflict do nothing", [id]),
    );
  await assignRole(pool, operator, "operator");
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [ids]);
  await admin.end();
  await pool.end();
});

describe("US-ONB-08 figures of the introduction", () => {
  it("US-ONB-08 · P-04 a plant keeper cannot call the function: the database checks the operator role again", async () => {
    await expect(store.figures(keeper, 90, 7)).rejects.toThrow(/Only the operator/);
  });

  it("US-ONB-08 counts accounts, settled ones without a plant, accounts with a plant and the median seconds to the first specimen", async () => {
    // Four accounts are 10 days old; two of them get a first specimen now, two stay without a plant.
    const old = ids.slice(2, 6);
    await admin.query(
      "update account set created_at = now() - interval '10 days' where id = any($1)",
      [old],
    );
    await createFixtureSpecimen(pool, old[0] as string, "figure-a");
    await createFixtureSpecimen(pool, old[1] as string, "figure-b");
    const f = await store.figures(operator, 90, 7);
    // Other test files add accounts in parallel: the figures are at least what this test created.
    expect(f.settled).toBeGreaterThanOrEqual(4);
    expect(f.settledWithoutPlant).toBeGreaterThanOrEqual(2);
    expect(f.withPlant).toBeGreaterThanOrEqual(2);
    expect(f.accounts).toBeGreaterThanOrEqual(ids.length);
    expect(f.medianSeconds).toBeGreaterThan(0);
  });
});
