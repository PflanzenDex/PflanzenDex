import { randomUUID } from "node:crypto";
import type { TargetLocationSource } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-04: create a cutting and repot it through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const subA = `bes4-${randomUUID()}`;
const subB = `bes4-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const NOW = new Date("2026-10-02T23:30:00Z");
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

// The port of PHA: the location of the growth phase, which a test dictates.
let growth: string | null = null;
const targetLocation: TargetLocationSource = {
  targetLocation: async () => null,
  growthLocation: async () => growth,
};
let app: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET" && key) headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
let speciesCounter = 0;
const newSpecies = async (sub: string) => {
  speciesCounter += 1;
  const name = `Steck${run}${"abcdefghij"[speciesCounter] ?? "z"}`;
  const r = await call(sub, "POST", "/species", {
    latinName: `${name} vera`,
    germanName: name,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  return r.body["id"] as string;
};
const create = (sub: string | null, speciesId: string, extra: Record<string, unknown> = {}) =>
  call(sub, "POST", "/specimens", { speciesId, timeZone: "Europe/Berlin", ...extra });
const repot = (sub: string | null, id: string) => call(sub, "POST", `/specimens/${id}/repot`, {});
const card = async (sub: string, id: string) =>
  (await call(sub, "GET", "/specimens/cards?timeZone=Europe/Berlin")).body["cards"].find(
    (k: { id: string }) => k.id === id,
  );

// Two zones: the first (lowest) is the cutting light, plus a location in the second.
async function zonesAndLocation(sub: string) {
  const low = await call(sub, "POST", "/light-zones", { name: `Unten ${run}`, luxCeiling: 10000 });
  const high = await call(sub, "POST", "/light-zones", { name: `Oben ${run}`, luxCeiling: 40000 });
  const location = await call(sub, "POST", "/locations", {
    name: `Regal ${run}`,
    kind: "indoor",
    lightZoneId: high.body["id"],
  });
  return { low: low.body["name"], high: high.body["name"], location: location.body["id"] };
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW, targetLocation });
});
afterAll(async () => {
  // Specimens first: the reference to the species is on delete restrict (AB-10).
  await pool.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await pool.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await pool.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-BES-04 sign-in and input", () => {
  it("US-BES-04: repotting without token: 401", async () => {
    const E = "00000000-0000-4000-8000-000000000001";
    expect((await repot(null, E)).status).toBe(401);
  });

  it("US-BES-04: an invalid status at creation: 400 with detail on the field, nothing is created", async () => {
    const species = await newSpecies(subA);
    for (const status of ["archived", "dead"]) {
      const r = await create(subA, species, { status });
      expect(r).toMatchObject({
        status: 400,
        body: { error: { details: [{ field: "status", code: "input.invalid" }] } },
      });
    }
    expect((await call(subA, "GET", "/specimens")).body["specimens"]).toEqual([]);
  });
});

describe("US-BES-04 create a cutting and repot it", () => {
  it("US-BES-04: a cutting stands under cutting light and does not count in the distribution; repotting brings it back", async () => {
    const z = await zonesAndLocation(subA);
    const species = await newSpecies(subA);
    const r = await create(subA, species, { status: "cutting", locationId: z.location });
    expect(r).toMatchObject({ status: 201, body: { status: "cutting", locationId: z.location } });
    const id = r.body["id"] as string;
    expect(await card(subA, id)).toMatchObject({ status: "cutting", lightZone: z.low });
    const before = (await call(subA, "GET", "/specimens/distribution")).body["distribution"];
    expect(before.notCounted.cuttingLight).toBe(1);
    expect(before.zones.map((x: { count: number }) => x.count)).toEqual([0]);

    const pot = await repot(subA, id);
    expect(pot).toMatchObject({ status: 200, body: { id, status: "plant" } });
    expect(await card(subA, id)).toMatchObject({ status: "plant", lightZone: z.high });
    const after = (await call(subA, "GET", "/specimens/distribution")).body["distribution"];
    expect(after.notCounted.cuttingLight).toBe(0);
    expect(after.zones.map((x: { count: number }) => x.count)).toEqual([1]);
  });

  it("US-BES-04: without a chosen location the location of the growth phase from the port applies", async () => {
    const z = await zonesAndLocation(subB);
    growth = z.location;
    try {
      const species = await newSpecies(subB);
      const r = await create(subB, species, { status: "cutting" });
      expect(r).toMatchObject({ status: 201, body: { status: "cutting", locationId: z.location } });
    } finally {
      growth = null;
    }
  });

  it("US-BES-04: without a value the new specimen is a plant", async () => {
    const species = await newSpecies(subA);
    const r = await create(subA, species, { marker: "plant" });
    expect(r).toMatchObject({ status: 201, body: { status: "plant" } });
  });

  it("US-BES-04: repotting a plant: 409 not_a_cutting, the status stays", async () => {
    const species = await newSpecies(subA);
    const id = (await create(subA, species, { marker: "pot" })).body["id"] as string;
    expect(await repot(subA, id)).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.not_a_cutting" } },
    });
    expect((await call(subA, "GET", `/specimens/${id}`)).body["status"]).toBe("plant");
  });

  it("US-BES-04: an archived cutting is not repotted (409)", async () => {
    const species = await newSpecies(subA);
    const id = (await create(subA, species, { status: "cutting", marker: "arch" })).body[
      "id"
    ] as string;
    await call(subA, "POST", `/specimens/${id}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "abgegeben",
    });
    expect((await repot(subA, id)).body["error"].code).toBe("specimen.not_a_cutting");
    expect((await call(subA, "GET", `/specimens/${id}`)).body["status"]).toBe("archived");
  });

  it("US-BES-04: the same Idempotency-Key repeats the first answer", async () => {
    const species = await newSpecies(subA);
    const id = (await create(subA, species, { status: "cutting", marker: "idem" })).body[
      "id"
    ] as string;
    const key = randomUUID();
    const first = await call(subA, "POST", `/specimens/${id}/repot`, {}, key);
    const second = await call(subA, "POST", `/specimens/${id}/repot`, {}, key);
    expect(first.status).toBe(200);
    expect(second).toEqual(first);
  });
});

describe("US-BES-04 tenant isolation (P-04)", () => {
  it("US-BES-04: a foreign cutting cannot be repotted (404 like unknown)", async () => {
    const species = await newSpecies(subA);
    const annas = (await create(subA, species, { status: "cutting", marker: "foreign" })).body[
      "id"
    ] as string;
    const foreign = await repot(subB, annas);
    const unknown = await repot(subB, "99999999-9999-4999-8999-999999999999");
    expect(foreign).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    expect(foreign.body).toEqual(unknown.body);
    expect((await call(subA, "GET", `/specimens/${annas}`)).body["status"]).toBe("cutting");
  });
});
