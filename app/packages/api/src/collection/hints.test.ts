import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openEnsuredOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-08: hints about incomplete specimens through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes8-${randomUUID()}`;
const subB = `bes8-${randomUUID()}`;
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
const hints = (sub: string | null) => call(sub, "GET", "/specimens/hints");
const kinds = (r: Response) =>
  (r.body["hints"] as { kind: string; specimenName: string }[]).map((h) => [
    h.specimenName,
    h.kind,
  ]);

const newSpecies = async (sub: string, name: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const location = async (sub: string, name: string, lightZoneId: string | null) =>
  (await call(sub, "POST", "/locations", { name, kind: "indoor", lightZoneId })).body[
    "id"
  ] as string;
const specimen = async (sub: string, marker: string, speciesId: string, locationId?: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker,
      ...(locationId ? { locationId } : {}),
    })
  ).body["id"] as string;

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

describe("US-BES-08 hints: sign-in", () => {
  it("GET /specimens/hints without token: 401", async () => {
    expect((await hints(null)).status).toBe(401);
  });

  it('the route "hints" is not read as the ID of a specimen', async () => {
    const r = await hints(subA);
    expect(r.status).toBe(200);
    expect(r.body["hints"]).toEqual([]);
  });
});

describe("US-BES-08 hints: incomplete specimens with the fixing action", () => {
  it("lists a specimen without location and one in a location without zone, not a complete or archived one", async () => {
    const species = await newSpecies(subA, `Aloe${run} vera`);
    const zone = (await call(subA, "POST", "/light-zones/defaults", {})).body["zones"][1].id;
    const complete = await location(subA, `Fenster ${run}`, zone);
    const noZone = await location(subA, `Kiste ${run}`, null);
    await specimen(subA, `Ok ${run}`, species, complete);
    await specimen(subA, `Ohne Ort ${run}`, species);
    await specimen(subA, `Ohne Zone ${run}`, species, noZone);
    const gone = await specimen(subA, `Weg ${run}`, species);
    const archived = await call(subA, "POST", `/specimens/${gone}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "abgegeben",
    });
    expect(archived.status).toBe(200);
    const r = await hints(subA);
    expect(r.status).toBe(200);
    expect(kinds(r)).toEqual([
      [expect.stringContaining(`Ohne Ort ${run}`), "location_missing"],
      [expect.stringContaining(`Ohne Zone ${run}`), "location_without_zone"],
    ]);
    for (const h of r.body["hints"]) expect(h.nextAction).not.toBe("");
  });

  it("a second account sees none of these hints and its own appear separately (P-04)", async () => {
    expect((await hints(subB)).body["hints"]).toEqual([]);
    const species = await newSpecies(subB, `Agave${run} utah`);
    await specimen(subB, `Bens ${run}`, species);
    const r = await hints(subB);
    expect(r.body["hints"]).toHaveLength(1);
    expect(r.body["hints"][0].specimenName).toContain(`Bens ${run}`);
    expect(JSON.stringify((await hints(subA)).body)).not.toContain(`Bens ${run}`);
  });
});
