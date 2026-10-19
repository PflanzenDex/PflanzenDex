import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  befriend,
  createAccountWithName,
  createFixtureSpecimen,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "../../fixtures.ts";
import { SharingPostgres } from "../index.ts";

// #907, US-SOZ-04, US-SOZ-05, P-04, P-05, QG-D1: `friend_shares()` and `friend_shares_since()` with a SUPERUSER as owner
// of the tables (a scratch database, see createSuperuserOwnerDatabase). Before migration 0090 a friend of one account
// also received the shared specimens of every other account.
let db: SuperuserOwnerDatabase;
let pool: Pool;
let sharing: SharingPostgres;
const [anna, ben, cleo, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let annas = "";
let cleos = "";
let doras = "";

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("shares");
  pool = db.pool;
  sharing = new SharingPostgres(pool);
  for (const id of [anna, ben, cleo, dora])
    await createAccountWithName(pool, id, `S-${id.slice(0, 4)}`);
  await befriend(pool, anna, ben);
  await befriend(pool, cleo, dora);
  annas = await createFixtureSpecimen(pool, anna, "Annas Ableger", pool);
  cleos = await createFixtureSpecimen(pool, cleo, "Cleos Ableger", pool);
  doras = await createFixtureSpecimen(pool, dora, "Doras Ableger", pool);
  for (const [owner, s] of [
    [anna, annas],
    [cleo, cleos],
    [dora, doras],
  ] as const)
    await sharing.set(owner, s, true, false);
});
afterAll(async () => {
  await db.drop();
});

describe("US-SOZ-04 friend_shares() with a superuser as table owner (#907)", () => {
  it("US-SOZ-04 a friend sees exactly what that friend shares, not what other accounts share", async () => {
    expect((await sharing.sharedBy(ben, anna)).map((r) => r.specimenId)).toEqual([annas]);
    expect((await sharing.sharedBy(dora, cleo)).map((r) => r.specimenId)).toEqual([cleos]);
  });

  it("US-SOZ-04 P-05 without a friendship nothing is returned, and a friend of somebody else sees nothing of the stranger", async () => {
    expect(await sharing.sharedBy(ben, cleo)).toEqual([]);
    expect(await sharing.sharedBy(cleo, anna)).toEqual([]);
    expect(await sharing.sharedBy(anna, dora)).toEqual([]);
  });
});

describe("US-SOZ-05 friend_shares_since() with a superuser as table owner (#907)", () => {
  it("US-SOZ-05 the feed of a friend lists only that friend's shared specimens", async () => {
    expect((await sharing.sharedBySince(ben, anna)).map((r) => r.specimenId)).toEqual([annas]);
    expect((await sharing.sharedBySince(dora, cleo)).map((r) => r.specimenId)).toEqual([cleos]);
    expect(await sharing.sharedBySince(ben, cleo)).toEqual([]);
  });
});
