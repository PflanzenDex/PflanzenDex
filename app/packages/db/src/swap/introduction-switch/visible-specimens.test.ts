import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  createAccountWithName,
  createFixtureSpecimen,
  visibleSpecimenIds,
} from "../../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";

// US-ONB-08, P-04, P-05, NFR-09: the operator's figures count `specimen` across accounts. These tests run as the
// application role with two accounts, on ONE connection, and prove that neither the call of the figures nor a
// transaction-local setting of the old switch (`pflanzendex.introduction_figures`, set by the application itself) makes
// a foreign specimen readable.
const SWITCH = "select set_config('pflanzendex.introduction_figures', 'on', true)";
let pool: Pool;
let single: Pool; // one connection only: every call below reuses the same session
let admin: Pool;
const [operator, anna, ben, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let annaSpecimen: string;

beforeAll(async () => {
  pool = openOwnerPool();
  single = new pg.Pool({
    connectionString: (pool as unknown as { options: { connectionString: string } }).options
      .connectionString,
    max: 1,
  });
  admin = openFixturePool();
  await migrate(pool);
  for (const id of [operator, anna, ben, dora])
    await createAccountWithName(pool, id, `I-${id.slice(0, 4)}`);
  await assignRole(pool, operator, "operator");
  annaSpecimen = await createFixtureSpecimen(pool, anna, "Anna-secret");
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[operator, anna, ben, dora]]);
  await admin.end();
  await single.end();
  await pool.end();
});

describe("US-ONB-08 · P-04 the figures of the introduction expose no foreign specimen", () => {
  it("US-ONB-08 after the operator called the figures on the same connection, a plant keeper sees only the own specimens", async () => {
    await withAccount(single, operator, (c) =>
      c.query("select * from operator_introduction(90, 7)"),
    );
    const own = await createFixtureSpecimen(pool, ben, "Ben-own");
    expect(await visibleSpecimenIds(single, ben)).toEqual([own]);
  });

  it("US-ONB-08 a plant keeper who sets the old switch itself still sees no foreign specimen", async () => {
    expect(await visibleSpecimenIds(single, dora, SWITCH)).toEqual([]);
    expect(await visibleSpecimenIds(single, ben, SWITCH)).not.toContain(annaSpecimen);
  });

  it("US-ONB-08 · P-04 the figures run inside the function: the caller's account is back and no rule opens `specimen`", async () => {
    const after = await withAccount(single, operator, async (c) => {
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
