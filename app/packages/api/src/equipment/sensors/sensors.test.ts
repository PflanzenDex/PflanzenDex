import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-06 through the API (real PostgreSQL): operation and maintenance, checks due, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ6-${randomUUID()}`;
const subB = `equ6-${randomUUID()}`;
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

const create = async (sub: string, type: string, name: string) =>
  (await call(sub, "POST", "/equipment", { type, name })).body["equipment"] as { id: string };
const view = async (sub: string) =>
  (await call(sub, "GET", "/equipment/sensors")).body as {
    sensors: { id: string; target: { kind: string; id: string; name: string } | null }[];
    specimens: { id: string }[];
    locations: { id: string }[];
  };
let specimenId = "";
let locationId = "";

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  const species = await call(subA, "POST", "/species", {
    latinName: `Sensor${subA.slice(5, 9).replace(/[^a-z]/g, "x")} test`,
    germanName: `Sensorpflanze ${subA.slice(5, 9).replace(/[^a-z]/g, "x")}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  specimenId = (
    await call(subA, "POST", "/specimens", {
      speciesId: species.body["id"],
      marker: "sensor",
      timeZone: "Europe/Berlin",
    })
  ).body["id"] as string;
  locationId = (await call(subA, "POST", "/locations", { name: "Sensorfenster", kind: "indoor" }))
    .body["id"] as string;
});
afterAll(async () => {
  const owned = "account_id in (select id from account where subject = any($1))";
  await admin.query(`delete from equipment where ${owned}`, [[subA, subB]]);
  await admin.query(`delete from specimen where ${owned}`, [[subA, subB]]);
  await admin.query(
    `delete from species where id in (select object_id from review_case where ${owned})`,
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-06 sensors and accessories through the API", () => {
  it("US-EQU-06 a sensor is assigned to a specimen, then to a location, then to none", async () => {
    const sensor = await create(subA, "Sensor", "Feuchtesensor");
    const listed = await view(subA);
    expect(listed.specimens.map((s) => s.id)).toContain(specimenId);
    expect(listed.locations.map((l) => l.id)).toContain(locationId);
    const toSpecimen = await call(subA, "POST", `/equipment/${sensor.id}/sensor-target`, {
      specimenId,
    });
    expect(toSpecimen.status).toBe(200);
    expect((await view(subA)).sensors.find((s) => s.id === sensor.id)?.target).toMatchObject({
      kind: "specimen",
      id: specimenId,
    });
    await call(subA, "POST", `/equipment/${sensor.id}/sensor-target`, { locationId });
    expect((await view(subA)).sensors.find((s) => s.id === sensor.id)?.target).toMatchObject({
      kind: "location",
      name: "Sensorfenster",
    });
    await call(subA, "POST", `/equipment/${sensor.id}/sensor-target`, {});
    expect((await view(subA)).sensors.find((s) => s.id === sensor.id)?.target).toBeNull();
  });

  it("US-EQU-06 refuses both places at once, a device that is no sensor and an unknown target", async () => {
    const sensor = await create(subA, "Sensor", "Sensor-Grenze");
    const both = await call(subA, "POST", `/equipment/${sensor.id}/sensor-target`, {
      specimenId,
      locationId,
    });
    expect(both.status).toBe(400);
    const timer = await create(subA, "Timer", "Timer-Sensor");
    const notSensor = await call(subA, "POST", `/equipment/${timer.id}/sensor-target`, {
      specimenId,
    });
    expect(notSensor.status).toBe(409);
    expect(notSensor.body["error"].code).toBe("equipment.not_a_sensor");
    const unknown = await call(subA, "POST", `/equipment/${sensor.id}/sensor-target`, {
      specimenId: randomUUID(),
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body["error"].code).toBe("equipment.target_unknown");
  });

  it("P-04 another account neither sees the sensor nor assigns to a foreign specimen", async () => {
    const mine = await create(subA, "Sensor", "Sensor-Privat");
    expect((await view(subB)).sensors.map((s) => s.id)).not.toContain(mine.id);
    expect((await view(subB)).specimens).toEqual([]);
    const theirs = await create(subB, "Sensor", "Sensor-B");
    const foreign = await call(subB, "POST", `/equipment/${theirs.id}/sensor-target`, {
      specimenId,
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body["error"].code).toBe("equipment.target_unknown");
    const other = await call(subB, "POST", `/equipment/${mine.id}/sensor-target`, {});
    expect(other.status).toBe(404);
  });
});
