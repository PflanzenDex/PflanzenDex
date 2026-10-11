import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { ZonePostgres } from "../light/index.ts";
import { EquipmentPostgres } from "./index.ts";

// US-EQU-01, DM-EQU-01, P-04: equipment per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let equipment: EquipmentPostgres;
let zones: ZonePostgres;
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
  lightZoneId: null,
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  equipment = new EquipmentPostgres(pool);
  zones = new ZonePostgres(pool);
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

const zoneValues = { luxCeiling: 15000, ppfd: null, sortOrder: null };
const zoneOf = async (user: string, name: string) => {
  const z = await zones.create(user, { ...zoneValues, name });
  if (typeof z === "string") throw new Error(z);
  return z.id;
};

describe("US-EQU-02 lamps and light zones in the database", () => {
  it("binds a lamp to a zone of the account and moves it", async () => {
    const z1 = await zoneOf(anna, "Z-Lampen-1");
    const z2 = await zoneOf(anna, "Z-Lampen-2");
    const lamp = await equipment.create(
      anna,
      { ...bare, name: "Zonenlampe", lightZoneId: z1 },
      "active",
    );
    if (typeof lamp === "string") throw new Error(lamp);
    expect(lamp.lightZoneId).toBe(z1);
    expect(await equipment.setZone(anna, lamp.id, z2)).toMatchObject({ lightZoneId: z2 });
    expect((await equipment.usingZone(anna, z2)).map((e) => e.name)).toEqual(["Zonenlampe"]);
    expect(await equipment.usingZone(anna, z1)).toEqual([]);
  });

  it("P-04 the zone of another account is unknown, also when moving", async () => {
    const foreign = await zoneOf(ben, "Z-Fremd");
    expect(
      await equipment.create(anna, { ...bare, name: "Fremdzone", lightZoneId: foreign }, "active"),
    ).toBe("zone_unknown");
    const own = await equipment.create(anna, { ...bare, name: "Eigenlampe" }, "active");
    if (typeof own === "string") throw new Error(own);
    expect(await equipment.setZone(anna, own.id, foreign)).toBe("zone_unknown");
    expect(await equipment.usingZone(anna, foreign)).toEqual([]);
  });

  it("P-10 a zone with a lamp cannot be deleted", async () => {
    const z = await zoneOf(anna, "Z-Belegt");
    await equipment.create(anna, { ...bare, name: "Belegt-Lampe", lightZoneId: z }, "active");
    expect(await zones.remove(anna, z)).toBe("in_use");
  });

  it("only lamps have a zone and only devices a state", async () => {
    const z = await zoneOf(anna, "Z-Nurlampen");
    const timer = await equipment.create(anna, { ...bare, type: "Timer", name: "Uhr" }, "active");
    const soil = await equipment.create(anna, { ...bare, type: "Substrate", name: "Erde-Z" }, null);
    if (typeof timer === "string" || typeof soil === "string") throw new Error("setup");
    expect(await equipment.setZone(anna, timer.id, z)).toBe("not_lamp");
    expect(await equipment.setZone(anna, randomUUID(), z)).toBe("not_found");
    expect(await equipment.setStatus(anna, timer.id, "retired")).toMatchObject({
      status: "retired",
    });
    expect(await equipment.setStatus(anna, soil.id, "retired")).toBe("no_status");
    expect(await equipment.setStatus(anna, randomUUID(), "retired")).toBe("not_found");
    await expect(
      withAccount(pool, anna, (c) =>
        c.query("update equipment set light_zone_id = $2 where id = $1", [timer.id, z]),
      ),
    ).rejects.toThrow();
  });

  it("P-04 another account changes neither zone nor state of a lamp", async () => {
    const z = await zoneOf(ben, "Z-Ben");
    const lamp = await equipment.create(anna, { ...bare, name: "Annas-Lampe" }, "active");
    if (typeof lamp === "string") throw new Error(lamp);
    expect(await equipment.setZone(ben, lamp.id, z)).toBe("not_found");
    expect(await equipment.setStatus(ben, lamp.id, "defective")).toBe("not_found");
  });
});

describe("US-EQU-04 operation and maintenance in the database", () => {
  const none = {
    inOperationSince: null,
    checkIntervalDays: null,
    lifetimeValue: null,
    lifetimeSource: null,
  };

  it("sets, reads back and clears the operation data and the last check of a device", async () => {
    const row = await equipment.create(anna, { ...bare, name: "Wartungslampe" }, "active");
    if (typeof row === "string") throw new Error(row);
    expect(row).toMatchObject({ ...none, lastCheckedOn: null });
    const data = {
      inOperationSince: "2026-01-10",
      checkIntervalDays: 90,
      lifetimeValue: "50.000 Stunden",
      lifetimeSource: "Datenblatt",
    };
    expect(await equipment.setMaintenance(anna, row.id, data)).toMatchObject(data);
    expect(await equipment.markChecked(anna, row.id, "2026-09-01")).toMatchObject({
      lastCheckedOn: "2026-09-01",
      checkIntervalDays: 90,
    });
    expect(await equipment.setMaintenance(anna, row.id, none)).toMatchObject(none);
  });

  it("a consumable has none of it; an unknown or foreign record looks missing (P-04)", async () => {
    const soil = await equipment.create(
      anna,
      { ...bare, name: "Erde Maint", type: "Substrate" },
      null,
    );
    if (typeof soil === "string") throw new Error(soil);
    expect(await equipment.setMaintenance(anna, soil.id, { ...none, checkIntervalDays: 7 })).toBe(
      "consumable",
    );
    expect(await equipment.markChecked(anna, soil.id, "2026-09-01")).toBe("consumable");
    const lamp = await equipment.create(anna, { ...bare, name: "Annas-Wartung" }, "active");
    if (typeof lamp === "string") throw new Error(lamp);
    expect(await equipment.setMaintenance(ben, lamp.id, none)).toBe("not_found");
    expect(await equipment.markChecked(ben, lamp.id, "2026-09-01")).toBe("not_found");
    expect(await equipment.markChecked(anna, randomUUID(), "2026-09-01")).toBe("not_found");
  });

  it("the database refuses a lifetime without source, an interval out of range and data on a consumable", async () => {
    const lamp = await equipment.create(anna, { ...bare, name: "Grenzlampe" }, "active");
    if (typeof lamp === "string") throw new Error(lamp);
    await expect(
      equipment.setMaintenance(anna, lamp.id, { ...none, lifetimeValue: "10 h" }),
    ).rejects.toThrow();
    await expect(
      equipment.setMaintenance(anna, lamp.id, { ...none, checkIntervalDays: 0 }),
    ).rejects.toThrow();
    const soil = await equipment.create(
      anna,
      { ...bare, name: "Erde Grenze", type: "Substrate" },
      null,
    );
    if (typeof soil === "string") throw new Error(soil);
    await expect(
      withAccount(pool, anna, (c) =>
        c.query("update equipment set check_interval_days = 5 where id = $1", [soil.id]),
      ),
    ).rejects.toThrow();
  });
});
