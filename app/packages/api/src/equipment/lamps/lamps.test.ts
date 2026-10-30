import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-03 through the API (real PostgreSQL): measured light intensity per lamp, FR-LIC-06, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ3-${randomUUID()}`;
const subB = `equ3-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer valid:${sub}`,
  };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let zoneA: Record<string, string> = {};
const defaults = async (sub: string) => {
  const r = await call(sub, "POST", "/light-zones/defaults", {});
  return Object.fromEntries(
    (r.body["zones"] as { id: string; name: string }[]).map((z) => [z.name, z.id]),
  ) as Record<string, string>;
};
const lampId = async (sub: string, name: string, zoneId: string) =>
  (await call(sub, "POST", "/equipment", { type: "Lamp", name, lightZoneId: zoneId })).body[
    "equipment"
  ].id as string;
const lights = async (sub: string) => (await call(sub, "GET", "/equipment/lamps")).body;
type LampRow = {
  id: string;
  last: { lux: number } | null;
  effective: { basis: string } | null;
  check: { deviationPercent: number } | null;
};
const lampRow = async (sub: string, id: string) =>
  ((await lights(sub))["lamps"] as LampRow[]).find((l) => l.id === id) as LampRow;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  zoneA = await defaults(subA);
  await defaults(subB);
});
afterAll(async () => {
  const owned = "account_id in (select id from account where subject = any($1))";
  for (const table of ["lamp_measurement", "equipment_setting", "equipment", "light_zone"])
    await admin.query(`delete from ${table} where ${owned}`, [[subA, subB]]);
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-03 measured light intensity through the API", () => {
  it("US-EQU-03 a lamp without a measurement is not measured and the zone value applies (FR-LIC-06)", async () => {
    const id = await lampId(subA, "Lampe ohne Messung", zoneA["Zone 2"] as string);
    expect(await lampRow(subA, id)).toMatchObject({
      last: null,
      effective: { lux: 15000, basis: "zone" },
    });
  });

  it("US-EQU-03 records a measurement and shows it apart from the manufacturer's statement", async () => {
    const id = await lampId(subA, "Lampe mit Messung", zoneA["Zone 2"] as string);
    const stated = await call(subA, "POST", `/equipment/${id}/lamp-data`, {
      powerW: 40,
      luxStatement: 20000,
    });
    expect(stated.status).toBe(200);
    const made = await call(subA, "POST", `/equipment/${id}/measurements`, {
      measuredOn: "2026-10-01",
      lux: 12000,
      distanceCm: 30,
      method: "Luxmeter",
    });
    expect(made.status).toBe(201);
    expect(made.body["measurement"]).toMatchObject({ lux: 12000, distanceCm: 30 });
    expect(await lampRow(subA, id)).toMatchObject({
      manufacturerLux: 20000,
      powerW: 40,
      last: { lux: 12000, measuredOn: "2026-10-01", method: "Luxmeter" },
      effective: { lux: 12000, basis: "measured" },
      check: null,
    });
  });

  it("US-EQU-03 Check zone appears only after the keeper sets a limit and the deviation exceeds it", async () => {
    const id = await lampId(subA, "Lampe Abweichung", zoneA["Zone 2"] as string);
    await call(subA, "POST", `/equipment/${id}/measurements`, {
      measuredOn: "2026-10-02",
      lux: 6000,
    });
    expect((await lampRow(subA, id)).check).toBeNull();
    const set = await call(subA, "POST", "/equipment/lamps/limit", { percent: 20 });
    expect(set.status).toBe(200);
    expect(set.body["percent"]).toBe(20);
    expect((await lights(subA))["limit"]).toBe(20);
    expect((await lampRow(subA, id)).check).toMatchObject({ deviationPercent: 60 });
    expect((await call(subA, "POST", "/equipment/lamps/limit", { percent: 0 })).status).toBe(400);
    await call(subA, "POST", "/equipment/lamps/limit", { percent: null });
    expect((await lampRow(subA, id)).check).toBeNull();
  });

  it("US-EQU-03 refuses invalid input and a record that is not a lamp", async () => {
    const id = await lampId(subA, "Lampe Eingabe", zoneA["Zone 3"] as string);
    const bad = await call(subA, "POST", `/equipment/${id}/measurements`, {
      measuredOn: "2026-10-02",
    });
    expect(bad.status).toBe(400);
    const pot = (await call(subA, "POST", "/equipment", { type: "Pot", name: "Topf-Messung" }))
      .body["equipment"].id as string;
    const notLamp = await call(subA, "POST", `/equipment/${pot}/measurements`, {
      measuredOn: "2026-10-02",
      lux: 100,
    });
    expect(notLamp.status).toBe(409);
    expect(notLamp.body["error"].code).toBe("equipment.not_a_lamp");
  });

  it("P-04 another account sees no lamps and cannot measure or describe a foreign lamp", async () => {
    const id = await lampId(subA, "Lampe privat", zoneA["Zone 2"] as string);
    expect(((await lights(subB))["lamps"] as LampRow[]).some((l) => l.id === id)).toBe(false);
    const measure = await call(subB, "POST", `/equipment/${id}/measurements`, {
      measuredOn: "2026-10-02",
      lux: 100,
    });
    expect(measure.status).toBe(404);
    expect(measure.body["error"].code).toBe("equipment.not_found");
    const describe = await call(subB, "POST", `/equipment/${id}/lamp-data`, { powerW: 5 });
    expect(describe.status).toBe(404);
    expect((await lights(subB))["limit"]).toBeNull();
  });
});
