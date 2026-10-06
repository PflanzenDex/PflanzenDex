import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openEnsuredOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-LIC-02: distribution of the specimens over the light zones through the API (real PostgreSQL, `make db-up`).
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
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const distribution = (sub: string | null) => call(sub, "GET", "/specimens/distribution");

const newSpecies = async (sub: string, name: string, lux: number, level: number) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: level,
      lightDemandLux: lux,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const defaults = async (sub: string) => {
  const r = await call(sub, "POST", "/light-zones/defaults", {});
  return Object.fromEntries(
    (r.body["zones"] as { id: string; name: string }[]).map((z) => [z.name, z.id]),
  );
};
const location = async (sub: string, name: string, lightZoneId: string | null) =>
  (await call(sub, "POST", "/locations", { name, kind: "indoor", lightZoneId })).body[
    "id"
  ] as string;
const specimen = async (sub: string, name: string, speciesId: string, locationId?: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker: name,
      ...(locationId ? { locationId } : {}),
    })
  ).body["id"] as string;
const zahlen = (r: Response) =>
  (r.body["distribution"].zones as { zone: { name: string }; count: number }[]).map((z) => [
    z.zone.name,
    z.count,
  ]);

beforeAll(async () => {
  pool = await openEnsuredOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
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

describe("US-LIC-02 Verteilung: Anmeldung", () => {
  it("GET /specimens/distribution without token: 401", async () => {
    expect((await distribution(null)).status).toBe(401);
  });

  it('the route "distribution" is not read as the ID of a specimen', async () => {
    expect((await distribution(subA)).status).toBe(200);
  });
});

describe("US-LIC-02 distribution: count and thinnest zone", () => {
  it("counts per zone 2 to 4, names the thinnest zone with the next action and leaves out cutting light", async () => {
    const zone = await defaults(subA);
    const window = await location(subA, `Fenster ${run}`, zone["Lampe 2"] ?? null);
    const shelf = await location(subA, `Regal ${run}`, zone["Lampe 3"] ?? null);
    const corner = await location(subA, `Ecke ${run}`, zone["Lampe 1"] ?? null);
    const low = await newSpecies(subA, `Aloe${run} vera`, 15000, 2);
    await specimen(subA, `A1 ${run}`, low, window);
    await specimen(subA, `A2 ${run}`, low, window);
    await specimen(subA, `A3 ${run}`, low, shelf);
    await specimen(subA, `A4 ${run}`, low, corner);
    const r = await distribution(subA);
    expect(r.status).toBe(200);
    expect(zahlen(r)).toEqual([
      ["Lampe 2", 2],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
    expect(r.body["distribution"].thinnest.map((z: { name: string }) => z.name)).toEqual([
      "Lampe 4",
    ]);
    expect(r.body["distribution"].notCounted.cuttingLight).toBe(1);
    expect(r.body["distribution"].hint.nextAction).not.toBe("");
  });

  it("a specimen without location zone takes the zone of the species derived from the lux need", async () => {
    const species = await newSpecies(subA, `Agave${run} utah`, 40000, 3);
    await specimen(subA, `Ohne Zone ${run}`, species);
    const r = await distribution(subA);
    expect(zahlen(r)).toEqual([
      ["Lampe 2", 2],
      ["Lampe 3", 2],
      ["Lampe 4", 0],
    ]);
  });

  it("status cutting and archived are not counted, but reported", async () => {
    await admin.query(
      `update specimen set status = 'cutting'
        where account_id = (select id from account where subject = $1) and marker = $2`,
      [subA, `A1 ${run}`],
    );
    await admin.query(
      `update specimen set status = 'archived', archived_at = '2026-10-03', archived_reason = 'verkauft'
        where account_id = (select id from account where subject = $1) and marker = $2`,
      [subA, `A3 ${run}`],
    );
    const r = await distribution(subA);
    expect(zahlen(r)).toEqual([
      ["Lampe 2", 1],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
    expect(r.body["distribution"].notCounted).toMatchObject({
      cuttingLight: 2,
      archived: 1,
    });
  });
});

describe("US-LIC-02 Verteilung: Mandant", () => {
  it("an account sees only the distribution of its own specimens and zones, never foreign names", async () => {
    const zone = await defaults(subB);
    const roof = await location(subB, `Dach ${run}`, zone["Lampe 4"] ?? null);
    const species = await newSpecies(subB, `Opuntia${run} ficus`, 110000, 4);
    await specimen(subB, `Bens Kaktus ${run}`, species, roof);
    const forBen = await distribution(subB);
    expect(zahlen(forBen)).toEqual([
      ["Lampe 2", 0],
      ["Lampe 3", 0],
      ["Lampe 4", 1],
    ]);
    const forAnna = await distribution(subA);
    expect(JSON.stringify(forAnna.body)).not.toContain(`Dach ${run}`);
    expect(JSON.stringify(forAnna.body)).not.toContain("Bens Kaktus");
    expect(zahlen(forAnna)[2]).toEqual(["Lampe 4", 0]);
  });

  it("an account without zones gets an empty distribution and the hint to create light zones", async () => {
    const r = await distribution(`lic2-${randomUUID()}`);
    expect(r.status).toBe(200);
    expect(r.body["distribution"].zones).toEqual([]);
    expect(r.body["distribution"].hint.nextAction).toContain("Lichtzone");
  });
});
