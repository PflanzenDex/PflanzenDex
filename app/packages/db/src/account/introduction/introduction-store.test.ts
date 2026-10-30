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
const ids = [operator, keeper, ...Array.from({ length: 8 }, () => randomUUID())];

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
    // Eight accounts are 10 days old; five of them get a first specimen now (the threshold of the median), three stay
    // without a plant.
    const old = ids.slice(2, 10);
    await admin.query(
      "update account set created_at = now() - interval '10 days' where id = any($1)",
      [old],
    );
    for (const [i, id] of old.slice(0, 5).entries())
      await createFixtureSpecimen(pool, id, `figure-${i}`);
    const f = await store.figures(operator, 90, 7);
    // Other test files add accounts in parallel: the figures are at least what this test created.
    expect(f.settled).toBeGreaterThanOrEqual(8);
    expect(f.settledWithoutPlant).toBeGreaterThanOrEqual(3);
    expect(f.withPlant).toBeGreaterThanOrEqual(5);
    expect(f.accounts).toBeGreaterThanOrEqual(ids.length);
    expect(f.medianSeconds).toBeGreaterThan(0);
  });

  it("US-ONB-08 · P-05 · P-08 below 5 accounts behind a figure the database answers NULL, also for the count of accounts", async () => {
    // A window of 0 days holds no account; a settle age of 100000 days leaves no settled account.
    const none = await store.figures(operator, 0, 7);
    expect(none).toEqual({
      accounts: null,
      settled: null,
      settledWithoutPlant: null,
      withPlant: null,
      medianSeconds: null,
    });
    const unsettled = await store.figures(operator, 90, 100000);
    expect(unsettled.settled).toBeNull();
    expect(unsettled.settledWithoutPlant).toBeNull();
    expect(unsettled.accounts).toBeGreaterThanOrEqual(5);
  });

  it("US-ONB-08 · P-04 the function gives the caller's account back and no rule opens `specimen` to the owner", async () => {
    const after = await withAccount(pool, operator, async (c) => {
      await c.query("select * from operator_introduction(90, 7)");
      return c.query("select current_setting('app.account_id') as id");
    });
    expect(after.rows[0].id).toBe(operator);
    const rules = await admin.query(
      "select polname from pg_policy where polrelid = 'specimen'::regclass",
    );
    expect(rules.rows.map((r) => r.polname)).toEqual(["tenant"]);
  });
});
