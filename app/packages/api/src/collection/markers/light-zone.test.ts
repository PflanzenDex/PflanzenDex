import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-LIC-02, US-BES-04: the own light zone of a specimen via the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `lic2-${randomUUID()}`;
const subB = `lic2-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const NOW = new Date("2026-10-02T23:30:00Z");
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (key) headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const newSpecies = async (sub: string, latin: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: latin,
      germanName: `Zonenart ${latin}`,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const create = (sub: string, input: Record<string, unknown>) =>
  call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", ...input });
const zone = async (sub: string, name: string, luxCeiling: number) =>
  (await call(sub, "POST", "/light-zones", { name, luxCeiling })).body["id"] as string;
const setZone = (sub: string, id: string, lightZoneId: string | null) =>
  call(sub, "POST", `/specimens/${id}/light-zone`, { lightZoneId });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-LIC-02 own light zone of a specimen via the API", () => {
  it("US-LIC-02: Given a specimen and zones, when I set an own zone, then the distribution counts it there and it can be cleared", async () => {
    const speciesId = await newSpecies(subA, `Zonaria${run} alpha`);
    await zone(subA, `Z1 ${run}`, 1500);
    await zone(subA, `Z2 ${run}`, 15000);
    const z3 = await zone(subA, `Z3 ${run}`, 40000);
    const made = await create(subA, { speciesId });
    expect(made.status).toBe(201);
    const id = made.body["id"] as string;

    const set = await setZone(subA, id, z3);
    expect(set).toMatchObject({ status: 200, body: { id, lightZoneId: z3 } });
    const counted = await call(subA, "GET", "/specimens/distribution");
    const zones = counted.body["distribution"]["zones"] as {
      zone: { id: string };
      count: number;
    }[];
    expect(zones.find((z) => z.zone.id === z3)?.count).toBe(1);

    const cleared = await setZone(subA, id, null);
    expect(cleared).toMatchObject({ status: 200, body: { id, lightZoneId: null } });
  });

  it("US-LIC-02: a specimen can be created with its own zone", async () => {
    const speciesId = await newSpecies(subA, `Zonaria${run} beta`);
    const z = await zone(subA, `Z4 ${run}`, 60000);
    const made = await create(subA, { speciesId, lightZoneId: z });
    expect(made).toMatchObject({ status: 201, body: { lightZoneId: z } });
  });

  it("US-LIC-05, P-10: a zone a specimen carries cannot be deleted unnoticed", async () => {
    const speciesId = await newSpecies(subA, `Zonaria${run} gamma`);
    const z = await zone(subA, `Z5 ${run}`, 80000);
    const made = await create(subA, { speciesId, lightZoneId: z });
    const refused = await call(subA, "DELETE", `/light-zones/${z}`);
    expect(refused).toMatchObject({ status: 409, body: { error: { code: "light_zone.in_use" } } });
    expect(JSON.stringify(refused.body)).toContain(made.body["id"]);
  });

  it("QG-D1, P-04: a zone of another account is refused as light_zone.not_found, on create and on set", async () => {
    const speciesId = await newSpecies(subA, `Zonaria${run} delta`);
    const bens = await zone(subB, `Bens ${run}`, 20000);
    const own = await create(subA, { speciesId });
    const id = own.body["id"] as string;
    expect(await setZone(subA, id, bens)).toMatchObject({
      status: 404,
      body: { error: { code: "light_zone.not_found" } },
    });
    expect(await create(subA, { speciesId, marker: "Zwei", lightZoneId: bens })).toMatchObject({
      status: 404,
      body: { error: { code: "light_zone.not_found" } },
    });
    const after = await call(subA, "GET", `/specimens/${id}`);
    expect(after.body["lightZoneId"] ?? null).toBeNull();
  });

  it("QG-D1, P-04: a foreign specimen looks unknown (404) and stays unchanged", async () => {
    const speciesId = await newSpecies(subB, `Zonaria${run} epsilon`);
    const theirs = await create(subB, { speciesId });
    const mine = await zone(subA, `Z6 ${run}`, 25000);
    expect(await setZone(subA, theirs.body["id"] as string, mine)).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    const seen = await call(subB, "GET", `/specimens/${theirs.body["id"]}`);
    expect(seen.body["lightZoneId"] ?? null).toBeNull();
  });

  it("P-03: without sign-in 401, without Idempotency-Key refused, malformed id 400", async () => {
    expect((await setZone(null as unknown as string, randomUUID(), null)).status).toBe(401);
    const speciesId = await newSpecies(subA, `Zonaria${run} zeta`);
    const made = await create(subA, { speciesId });
    const id = made.body["id"] as string;
    const noKey = await call(
      subA,
      "POST",
      `/specimens/${id}/light-zone`,
      { lightZoneId: null },
      null,
    );
    expect(noKey.status).toBeGreaterThanOrEqual(400);
    expect((await setZone(subA, id, "kein-id")).status).toBe(400);
  });
});
