import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { WishesPostgres } from "../../wishlist/index.ts";
import { EquipmentWishesPostgres } from "../index.ts";

// US-EQU-08, DM-WUN-01, P-04: wishes of type equipment per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let eq: EquipmentWishesPostgres;
let plants: WishesPostgres;
const anna = randomUUID();
const ben = randomUUID();
const wish = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  nameKey: name.toLowerCase(),
  equipmentType: "Lamp" as const,
  productId: null,
  priceEur: null,
  ...extra,
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  eq = new EquipmentWishesPostgres(pool);
  plants = new WishesPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-08 equipment wishes in the wish table", () => {
  it("US-EQU-08 stores type, product id and price; the price leaves as a number", async () => {
    const r = await eq.create(anna, wish("Growlight X", { productId: "GL-1", priceEur: 49.9 }));
    expect(r).toMatchObject({
      name: "Growlight X",
      equipmentType: "Lamp",
      productId: "GL-1",
      priceEur: 49.9,
      status: "wishlist",
    });
  });

  it("US-EQU-08 equipment wishes never show up among the plant wishes (buffer and zone hints unchanged)", async () => {
    await eq.create(anna, wish("Timer Y", { equipmentType: "Timer" }));
    const plantsOpen = await plants.open(anna);
    expect(plantsOpen.map((w) => w.name)).not.toContain("Timer Y");
    expect(await plants.bought(anna)).toEqual([]);
    expect(await plants.discarded(anna)).toEqual([]);
    expect(await plants.buy(anna, (await eq.list(anna))[0]?.id ?? "")).toBe("not_found");
  });

  it("US-EQU-08 the name is unique among all wishes of the account, plant or equipment", async () => {
    await plants.create(anna, {
      name: "Aloe vera",
      nameKey: "aloe vera",
      german: null,
      targetZoneId: null,
      difficulty: null,
      reasoning: null,
      imageUrl: null,
      imageSource: null,
      license: null,
    });
    expect(await eq.create(anna, wish("Aloe vera"))).toBe("name_taken");
  });

  it("US-EQU-08 Bought changes an open wish once, a second call changes nothing", async () => {
    const made = await eq.create(anna, wish("Pumpe Z", { equipmentType: "Pump" }));
    const id = typeof made === "string" ? "" : made.id;
    expect(await eq.buy(anna, id)).toMatchObject({ changed: true, wish: { status: "bought" } });
    expect(await eq.buy(anna, id)).toMatchObject({ changed: false });
    expect(await eq.discard(anna, id)).toBe("not_open");
  });

  it("US-EQU-08 P-04: another account sees and changes nothing", async () => {
    const made = await eq.create(anna, wish("Privat"));
    const id = typeof made === "string" ? "" : made.id;
    expect((await eq.list(ben)).map((w) => w.name)).toEqual([]);
    expect(await eq.buy(ben, id)).toBe("not_found");
    expect(await eq.discard(ben, id)).toBe("not_found");
    expect((await eq.list(anna)).find((w) => w.id === id)?.status).toBe("wishlist");
  });

  it("US-EQU-08 the database refuses an equipment wish without type and a plant wish with equipment data", async () => {
    await expect(
      withAccount(pool, anna, (c) =>
        c.query("insert into wish (account_id, name, type) values ($1, 'Ohne Art', 'equipment')", [
          anna,
        ]),
      ),
    ).rejects.toMatchObject({ constraint: "wish_equipment_fields" });
    await expect(
      withAccount(pool, anna, (c) =>
        c.query("insert into wish (account_id, name, price_eur) values ($1, 'Pflanze', 3)", [anna]),
      ),
    ).rejects.toMatchObject({ constraint: "wish_equipment_fields" });
  });
});
