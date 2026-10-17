import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { DeviationLimitPostgres, EquipmentPostgres, LampMeasurementsPostgres } from "../index.ts";

// US-EQU-03, FR-LIC-06, P-04: the measurement log and the deviation limit per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let equipment: EquipmentPostgres;
let log: LampMeasurementsPostgres;
let limits: DeviationLimitPostgres;
const anna = randomUUID();
const ben = randomUUID();
const bare = {
  type: "Lamp" as const,
  name: "Messlampe",
  manufacturer: null,
  model: null,
  productId: null,
  priceEur: null,
  boughtAt: null,
  note: null,
  lightZoneId: null,
};
const entry = (equipmentId: string, extra = {}) => ({
  equipmentId,
  measuredOn: "2026-10-01",
  lux: 12000,
  distanceCm: null,
  method: null,
  ...extra,
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  equipment = new EquipmentPostgres(pool);
  log = new LampMeasurementsPostgres(pool);
  limits = new DeviationLimitPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

const lampOf = async (user: string, name: string, type: "Lamp" | "Pot" = "Lamp") => {
  const row = await equipment.create(user, { ...bare, name, type }, "active");
  if (typeof row === "string") throw new Error(row);
  return row.id;
};

describe("US-EQU-03 measurement log in the database", () => {
  it("stores a measurement with unknown distance and method as null and lists newest date first", async () => {
    const id = await lampOf(anna, "Lampe-Log");
    expect(await log.add(anna, entry(id))).toMatchObject({
      lux: 12000,
      measuredOn: "2026-10-01",
      distanceCm: null,
      method: null,
    });
    await log.add(
      anna,
      entry(id, { measuredOn: "2026-10-05", lux: 9000, distanceCm: 30, method: "Luxmeter" }),
    );
    await log.add(anna, entry(id, { measuredOn: "2026-10-05", lux: 9500 }));
    const mine = (await log.list(anna)).filter((m) => m.equipmentId === id);
    expect(mine.map((m) => [m.measuredOn, m.lux])).toEqual([
      ["2026-10-05", 9500],
      ["2026-10-05", 9000],
      ["2026-10-01", 12000],
    ]);
  });

  it("only lamps are measured; an unknown or foreign record looks missing (P-04)", async () => {
    const pot = await lampOf(anna, "Topf-Log", "Pot");
    expect(await log.add(anna, entry(pot))).toBe("not_lamp");
    expect(await log.add(anna, entry(randomUUID()))).toBe("not_found");
    const lamp = await lampOf(anna, "Annas-Messlampe");
    expect(await log.add(ben, entry(lamp))).toBe("not_found");
    expect(await log.list(ben)).toEqual([]);
  });

  it("the database refuses a measurement of another account's lamp and values out of range", async () => {
    const lamp = await lampOf(anna, "Fremd-Messlampe");
    await expect(
      withAccount(pool, ben, (c) =>
        c.query(
          "insert into lamp_measurement (account_id, equipment_id, measured_on, lux) values ($1, $2, '2026-10-01', 100)",
          [ben, lamp],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into lamp_measurement (account_id, equipment_id, measured_on, lux) values ($1, $2, '2026-10-01', 0)",
          [anna, lamp],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("US-EQU-03 lamp data and deviation limit in the database", () => {
  it("sets and clears the manufacturer's statement, only on lamps", async () => {
    const id = await lampOf(anna, "Lampe-Daten");
    expect(
      await equipment.setLampData(anna, id, { powerW: 40, luxStatement: 20000 }),
    ).toMatchObject({
      powerW: 40,
      luxStatement: 20000,
    });
    expect(
      await equipment.setLampData(anna, id, { powerW: null, luxStatement: null }),
    ).toMatchObject({
      powerW: null,
      luxStatement: null,
    });
    const pot = await lampOf(anna, "Topf-Daten", "Pot");
    expect(await equipment.setLampData(anna, pot, { powerW: 1, luxStatement: 1 })).toBe("not_lamp");
    expect(await equipment.setLampData(anna, randomUUID(), { powerW: 1, luxStatement: 1 })).toBe(
      "not_found",
    );
    expect(await equipment.setLampData(ben, id, { powerW: 1, luxStatement: 1 })).toBe("not_found");
  });

  it("the limit is open until set, can be changed and cleared, and is per account", async () => {
    expect(await limits.limit(anna)).toBeNull();
    expect(await limits.setLimit(anna, 20)).toBe(20);
    expect(await limits.setLimit(anna, 35)).toBe(35);
    expect(await limits.limit(anna)).toBe(35);
    expect(await limits.limit(ben)).toBeNull();
    expect(await limits.setLimit(anna, null)).toBeNull();
    expect(await limits.limit(anna)).toBeNull();
    await expect(limits.setLimit(anna, 0)).rejects.toThrow();
  });
});
