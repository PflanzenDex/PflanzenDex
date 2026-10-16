import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  fillAccountWithFixtures,
  migrate,
  openFixturePool,
  openOwnerPool,
} from "../../kernel/index.ts";
import { FIXTURES, createFixtureSpeciesAt } from "../../fixtures.ts";
import { AccountDataPostgres } from "./data-export.ts";
import { accountTables, NOT_EXPORTED } from "./tables.ts";

let pool: Pool;
let admin: Pool;
const mine = randomUUID();
const other = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await createFixtureSpeciesAt();
  for (const id of [mine, other]) await admin.query("insert into account (id) values ($1)", [id]);
  await fillAccountWithFixtures(pool, FIXTURES, mine);
  await fillAccountWithFixtures(pool, FIXTURES, other);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[mine, other]]);
  await admin.end();
  await pool.end();
});

describe("US-ACC-04 AccountDataSource: export of all own data", () => {
  it("US-ACC-04 holds a row for every table with an account id, and only the own rows", async () => {
    const snapshot = await new AccountDataPostgres(pool).read(mine);
    const expected = (await accountTables(pool)).map((t) => t.name);
    expect(Object.keys(snapshot?.tables ?? {})).toEqual(expect.arrayContaining(expected));
    for (const name of expected) expect(snapshot?.tables[name]?.length, name).toBeGreaterThan(0);
    const foreign = JSON.stringify(snapshot).includes(other);
    expect(foreign).toBe(false);
  });

  it("US-ACC-04 is reproducible: the same data gives the same snapshot", async () => {
    const source = new AccountDataPostgres(pool);
    expect(JSON.stringify(await source.read(mine))).toBe(JSON.stringify(await source.read(mine)));
  });

  it("US-ACC-04 leaves out credentials of the delivery channel and the tables with a stated reason", async () => {
    const snapshot = await new AccountDataPostgres(pool).read(mine);
    const channel = snapshot?.tables["delivery_channel"]?.[0] ?? {};
    expect(Object.keys(channel)).not.toEqual(expect.arrayContaining(["endpoint"]));
    expect(Object.keys(channel)).not.toEqual(expect.arrayContaining(["p256dh"]));
    expect(Object.keys(channel)).not.toEqual(expect.arrayContaining(["auth"]));
    for (const name of Object.keys(NOT_EXPORTED)) expect(snapshot?.tables[name]).toBeUndefined();
  });

  it("US-ACC-04 answers null for an account that does not exist", async () => {
    expect(await new AccountDataPostgres(pool).read(randomUUID())).toBeNull();
  });
});
