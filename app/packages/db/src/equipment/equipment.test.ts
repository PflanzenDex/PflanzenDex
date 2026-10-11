import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { EquipmentPostgres } from "./index.ts";

// US-EQU-01, DM-EQU-01, P-04: equipment per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let equipment: EquipmentPostgres;
const anna = randomUUID();
const ben = randomUUID();
const bare = {
  type: "Lamp" as const,
  name: "Lampe 3",
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  equipment = new EquipmentPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-01 equipment in the database", () => {
  it("stores unknown values as null and returns a given price and date unchanged", async () => {
    expect(await equipment.create(anna, bare, "active")).toMatchObject({
      name: "Lampe 3",
      status: "active",
      priceEur: null,
      boughtAt: null,
    });
    const full = await equipment.create(
      anna,
      { ...bare, name: "Timer", type: "Timer", priceEur: 12.5, boughtAt: "2026-03-01" },
      "active",
    );
    expect(full).toMatchObject({ priceEur: 12.5, boughtAt: "2026-03-01" });
  });

  it("P-04 the name is unique per account (case-insensitive), not across accounts", async () => {
    expect(await equipment.create(anna, { ...bare, name: "LAMPE 3" }, "active")).toBe("name_taken");
    expect(await equipment.create(ben, bare, "active")).toMatchObject({ name: "Lampe 3" });
  });

  it("P-04 each account lists only its own equipment", async () => {
    expect((await equipment.list(ben)).map((e) => e.name)).toEqual(["Lampe 3"]);
    expect((await equipment.list(anna)).length).toBeGreaterThan(1);
  });

  it("P-10 an error other than a duplicate name is not swallowed", async () => {
    await expect(equipment.create(randomUUID(), bare, "active")).rejects.toThrow();
  });

  it("FR-EQU-03 the database refuses a product id that is a URL and a consumable with a status", async () => {
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into equipment (account_id, type, name, status, product_id) values ($1, 'Lamp', 'U', 'active', 'https://x.example')",
          [anna],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into equipment (account_id, type, name, status) values ($1, 'Substrate', 'S', 'active')",
          [anna],
        ),
      ),
    ).rejects.toThrow();
  });
});
