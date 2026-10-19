import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  befriend,
  createAccountWithName,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "../../fixtures.ts";
import { EquipmentPostgres, EquipmentSharingPostgres } from "../index.ts";

// #907, US-EQU-12, P-04, P-05, QG-D1: `friend_equipment()` with a SUPERUSER as owner of the tables (a scratch database,
// see createSuperuserOwnerDatabase). Before migration 0091 a friend of one account also received the shared equipment
// of every other account.
let db: SuperuserOwnerDatabase;
let pool: Pool;
let sharing: EquipmentSharingPostgres;
const [anna, ben, cleo, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const bare = {
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
  lightZoneId: null,
};

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("equipment");
  pool = db.pool;
  sharing = new EquipmentSharingPostgres(pool);
  const equipment = new EquipmentPostgres(pool);
  for (const id of [anna, ben, cleo, dora])
    await createAccountWithName(pool, id, `S-${id.slice(0, 4)}`);
  await befriend(pool, anna, ben);
  await befriend(pool, cleo, dora);
  for (const [owner, name] of [
    [anna, "Annas Timer"],
    [cleo, "Cleos Timer"],
    [dora, "Doras Timer"],
  ] as const) {
    const made = await equipment.create(owner, { type: "Timer", name, ...bare }, "active");
    if (typeof made === "string") throw new Error(made);
    await sharing.set(owner, made.id, true, null);
  }
  const private_ = await equipment.create(
    anna,
    { type: "Timer", name: "Annas privater Timer", ...bare },
    "active",
  );
  if (typeof private_ === "string") throw new Error(private_);
});
afterAll(async () => {
  await db.drop();
});

describe("US-EQU-12 friend_equipment() with a superuser as table owner (#907)", () => {
  it("US-EQU-12 a friend sees exactly the equipment that friend shares, never the shared equipment of other accounts", async () => {
    expect((await sharing.sharedBy(ben, anna)).map((d) => d.name)).toEqual(["Annas Timer"]);
    expect((await sharing.sharedBy(dora, cleo)).map((d) => d.name)).toEqual(["Cleos Timer"]);
  });

  it("US-EQU-12 P-05 without a friendship nothing is returned", async () => {
    expect(await sharing.sharedBy(ben, cleo)).toEqual([]);
    expect(await sharing.sharedBy(cleo, anna)).toEqual([]);
  });
});
