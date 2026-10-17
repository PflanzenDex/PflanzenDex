import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName } from "../../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../../kernel/index.ts";
import { EquipmentPostgres, EquipmentSharingPostgres } from "../index.ts";

// US-EQU-12, FR-EQU-02, P-04, P-05: sharing equipment with friends (real PostgreSQL, `make db-up`). What a friend sees
// through `friend_equipment()` is tested end to end through the API (`friend-equipment.test.ts`).
let pool: Pool;
let admin: Pool;
let sharing: EquipmentSharingPostgres;
let equipment: EquipmentPostgres;
const [anna, ben] = [randomUUID(), randomUUID()];
const bare = {
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
  lightZoneId: null,
};
async function device(owner: string, name: string) {
  const r = await equipment.create(owner, { type: "Timer", name, ...bare }, "active");
  if (typeof r === "string") throw new Error(r);
  return r.id;
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  sharing = new EquipmentSharingPostgres(pool);
  equipment = new EquipmentPostgres(pool);
  for (const id of [anna, ben]) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
  await admin.end();
});

describe("US-EQU-12 sharing equipment in the database", () => {
  it("US-EQU-12 equipment is private by default; sharing with a note and withdrawing it clears the note", async () => {
    const id = await device(anna, "Timer privat");
    expect(await sharing.list(anna)).toEqual([]);
    expect(await sharing.set(anna, id, true, "läuft seit Jahren")).toBe("ok");
    expect(await sharing.list(anna)).toEqual([{ equipmentId: id, note: "läuft seit Jahren" }]);
    expect(await sharing.set(anna, id, false, "bleibt nicht")).toBe("ok");
    expect(await sharing.list(anna)).toEqual([]);
    await sharing.set(anna, id, true, null);
    expect(await sharing.list(anna)).toEqual([{ equipmentId: id, note: null }]);
  });

  it("US-EQU-12 P-04: foreign equipment cannot be shared or withdrawn, and the settings stay private", async () => {
    const mine = await device(anna, "Annas Gerät");
    await sharing.set(anna, mine, true, "Notiz");
    expect(await sharing.set(ben, mine, true, null)).toBe("not_found");
    expect(await sharing.set(ben, mine, false, null)).toBe("not_found");
    expect(await sharing.list(ben)).toEqual([]);
    expect((await sharing.list(anna)).map((r) => r.equipmentId)).toContain(mine);
  });

  it("US-EQU-12 the database refuses a note on equipment that is not shared", async () => {
    const id = await device(anna, "Ohne Freigabe");
    await expect(
      admin.query("update equipment set share_note = 'x' where id = $1", [id]),
    ).rejects.toMatchObject({ constraint: "equipment_share_note_shared_only" });
  });
});
