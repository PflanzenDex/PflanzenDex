import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CarePhase, PhaseLocationSource } from "@pflanzendex/core";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-PHA-03: confirm a move with a tap, and set a location (BES-08) through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `pha3-${randomUUID()}`;
const subB = `pha3-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-31 23:30 UTC: already 1 November (dormancy) in Berlin, still 31 October (growth) in UTC.
const NOW = new Date("2026-10-31T23:30:00Z");
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Plan = Record<string, Partial<Record<CarePhase, string>>>;
// The care profile (US-BES-09) does not exist yet; the test source plays it. Keyed by species id.
const plan: Record<string, Plan> = {};
const phaseLocation: PhaseLocationSource = {
  phaseLocation: async (userId, speciesId, phase) => plan[userId]?.[speciesId]?.[phase] ?? null,
};
let app: ReturnType<typeof createApp>;
let appWithoutProfile: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
  which = app,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET" && key) headers["idempotency-key"] = key;
  const res = await which.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // A missing route answers plain text; keep the status so the failing assertion names it.
  const parsed = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: parsed };
}

const newSpecies = async (sub: string, name: string, dormancy: boolean) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      ...(dormancy ? { dormancyFrom: "11-01", dormancyUntil: "03-15" } : {}),
    })
  ).body["id"] as string;
const location = async (sub: string, name: string) =>
  (await call(sub, "POST", "/locations", { name, kind: "indoor", lightZoneId: null })).body[
    "id"
  ] as string;
const specimen = async (sub: string, speciesId: string, name: string, extra = {}) =>
  (
    await call(sub, "POST", "/specimens", {
      speciesId,
      marker: name,
      timeZone: "Europe/Berlin",
      ...extra,
    })
  ).body["id"] as string;
const confirm = (sub: string | null, specimenIds: unknown, timeZone = "UTC", key?: string) =>
  call(sub, "POST", "/care-phases/confirm", { specimenIds, timeZone }, key);
const phases = async (sub: string, timeZone = "UTC") =>
  (await call(sub, "GET", `/care-phases?timeZone=${timeZone}`)).body["phases"] as {
    specimenId: string;
    locationId: string | null;
    targetLocationId: string | null;
  }[];
const hintKinds = async (sub: string, id: string) =>
  (
    (await call(sub, "GET", "/specimens/hints")).body["hints"] as {
      specimenId: string;
      kind: string;
    }[]
  )
    .filter((h) => h.specimenId === id)
    .map((h) => h.kind);

let speciesA: string;
let speciesNoDormancy: string;
let living: string;
let cold: string;
let foreignLocation: string;

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW, phaseLocation });
  appWithoutProfile = createApp({ reviewer, pool, clock: () => NOW });
  speciesA = await newSpecies(subA, `Winter${run}`, true);
  speciesNoDormancy = await newSpecies(subA, `Immer${run}`, false);
  living = await location(subA, `Wohnzimmer ${run}`);
  cold = await location(subA, `Kühler Flur ${run}`);
  foreignLocation = await location(subB, `Bens Flur ${run}`);
  plan[subA] = { [speciesA]: { dormancy: cold, growth: living } };
});
afterAll(async () => {
  const subs = [[subA, subB]];
  // Specimens first: the reference to the species is on delete restrict (AB-10).
  await pool.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    subs,
  );
  await pool.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    subs,
  );
  await pool.query("delete from account where subject = any($1)", subs);
  await pool.end();
});

describe("US-PHA-03 confirm a move through the API", () => {
  it("US-PHA-03 without token: 401", async () => {
    expect((await confirm(null, [randomUUID()])).status).toBe(401);
    expect((await call(null, "POST", `/specimens/${randomUUID()}/location`, {})).status).toBe(401);
  });

  it("US-PHA-03 'moved now' sets the location to the target of the local phase, list and hints follow", async () => {
    const id = await specimen(subA, speciesA, "eins");
    expect(await hintKinds(subA, id)).toEqual(["location_missing"]);
    expect((await phases(subA, "Europe/Berlin")).find((p) => p.specimenId === id)).toMatchObject({
      locationId: null,
      targetLocationId: cold,
    });

    const r = await confirm(subA, [id], "Europe/Berlin");
    expect(r).toMatchObject({
      status: 200,
      body: { specimens: [{ specimenId: id, locationId: cold, changed: true }] },
    });
    expect((await phases(subA, "Europe/Berlin")).find((p) => p.specimenId === id)).toMatchObject({
      locationId: cold,
      targetLocationId: cold,
    });
    // BES-08: the hint "location missing" is gone; the location has no light zone yet, which is its own hint.
    expect(await hintKinds(subA, id)).toEqual(["location_without_zone"]);
  });

  it("US-PHA-03 the date is the local one: in UTC it is still the growth phase", async () => {
    const id = await specimen(subA, speciesA, "zwei");
    const r = await confirm(subA, [id], "UTC");
    expect(r.body["specimens"][0]).toMatchObject({ locationId: living, changed: true });
  });

  it("US-PHA-03 several specimens are confirmed in one step; a double tap with the same key writes once", async () => {
    const a = await specimen(subA, speciesA, "drei", { locationId: living });
    const b = await specimen(subA, speciesA, "vier", { locationId: living });
    const key = randomUUID();
    const first = await confirm(subA, [a, b], "Europe/Berlin", key);
    expect(first.body["specimens"]).toEqual([
      { specimenId: a, locationId: cold, changed: true },
      { specimenId: b, locationId: cold, changed: true },
    ]);
    const second = await confirm(subA, [a, b], "Europe/Berlin", key);
    expect(second).toEqual(first);
  });

  it("US-PHA-03 confirming again with a new key changes nothing (idempotent)", async () => {
    const id = await specimen(subA, speciesA, "fuenf", { locationId: cold });
    const r = await confirm(subA, [id], "Europe/Berlin");
    expect(r.body["specimens"]).toEqual([{ specimenId: id, locationId: cold, changed: false }]);
  });

  it("US-PHA-03 a step with a cutting or a species without dormancy fails as a whole with 409", async () => {
    const plant = await specimen(subA, speciesA, "sechs", { locationId: living });
    const cutting = await specimen(subA, speciesA, "sieben", { status: "cutting" });
    const without = await specimen(subA, speciesNoDormancy, "acht");
    for (const bad of [cutting, without]) {
      const r = await confirm(subA, [plant, bad], "Europe/Berlin");
      expect(r.status).toBe(409);
      expect(r.body["error"]).toMatchObject({ code: "care.no_phase", data: { specimenId: bad } });
    }
    expect((await phases(subA, "Europe/Berlin")).find((p) => p.specimenId === plant)).toMatchObject(
      { locationId: living },
    );
  });

  it("US-PHA-03 without a known target nothing is invented: 409 care.target_unknown", async () => {
    const id = await specimen(subA, speciesA, "neun", { locationId: living });
    const r = await call(
      subA,
      "POST",
      "/care-phases/confirm",
      {
        specimenIds: [id],
        timeZone: "UTC",
      },
      undefined,
      appWithoutProfile,
    );
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("care.target_unknown");
  });

  it("US-PHA-03 an archived specimen is refused with 409 specimen.archived", async () => {
    const id = await specimen(subA, speciesA, "zehn", { locationId: living });
    await call(subA, "POST", `/specimens/${id}/archive`, {
      reason: "eingegangen",
      timeZone: "UTC",
    });
    const r = await confirm(subA, [id]);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("specimen.archived");
  });

  it("US-PHA-03 invalid input: 400; missing key: 400", async () => {
    for (const ids of [[], ["x"], "x", undefined]) {
      const r = await confirm(subA, ids);
      expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    }
    const r = await call(subA, "POST", "/care-phases/confirm", {}, null);
    expect(r.status).toBe(400);
  });

  it("US-PHA-03 another account cannot switch the specimen and sees nothing of it (P-04)", async () => {
    const id = await specimen(subA, speciesA, "elf", { locationId: living });
    const r = await confirm(subB, [id]);
    expect(r.status).toBe(404);
    expect(r.body["error"].code).toBe("specimen.not_found");
    expect((await phases(subB)).map((p) => p.specimenId)).not.toContain(id);
    expect((await phases(subA)).find((p) => p.specimenId === id)?.locationId).toBe(living);
  });
});

describe("US-PHA-03 set the location of a specimen through the API (BES-08 'location missing')", () => {
  it("US-PHA-03 a selected location is set; the hint 'location missing' disappears", async () => {
    const id = await specimen(subA, speciesA, "zwoelf");
    expect(await hintKinds(subA, id)).toContain("location_missing");
    const r = await call(subA, "POST", `/specimens/${id}/location`, { locationId: living });
    expect(r).toMatchObject({ status: 200, body: { id, locationId: living } });
    expect(await hintKinds(subA, id)).not.toContain("location_missing");
    expect((await phases(subA)).find((p) => p.specimenId === id)?.locationId).toBe(living);
  });

  it("US-PHA-03 setting the same location again is fine (idempotent)", async () => {
    const id = await specimen(subA, speciesA, "dreizehn", { locationId: living });
    for (let i = 0; i < 2; i++) {
      const r = await call(subA, "POST", `/specimens/${id}/location`, { locationId: living });
      expect(r).toMatchObject({ status: 200, body: { locationId: living } });
    }
  });

  it("US-PHA-03 free text: 400, location of another account: 404, foreign specimen: 404 (P-04)", async () => {
    const id = await specimen(subA, speciesA, "vierzehn");
    const text = await call(subA, "POST", `/specimens/${id}/location`, { locationId: "Flur" });
    expect(text).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    const foreign = await call(subA, "POST", `/specimens/${id}/location`, {
      locationId: foreignLocation,
    });
    expect(foreign).toMatchObject({ status: 404, body: { error: { code: "location.not_found" } } });
    const other = await call(subB, "POST", `/specimens/${id}/location`, {
      locationId: foreignLocation,
    });
    expect(other).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    expect((await call(subA, "GET", `/specimens/${id}`)).body["locationId"]).toBeNull();
  });

  it("US-PHA-03 an archived specimen keeps its location: 409", async () => {
    const id = await specimen(subA, speciesA, "fuenfzehn", { locationId: living });
    await call(subA, "POST", `/specimens/${id}/archive`, {
      reason: "eingegangen",
      timeZone: "UTC",
    });
    const r = await call(subA, "POST", `/specimens/${id}/location`, { locationId: cold });
    expect(r).toMatchObject({ status: 409, body: { error: { code: "specimen.archived" } } });
  });

  it("US-PHA-03 a cutting can be placed and stays a cutting (US-BES-04)", async () => {
    const id = await specimen(subA, speciesA, "sechzehn", { status: "cutting" });
    const r = await call(subA, "POST", `/specimens/${id}/location`, { locationId: living });
    expect(r).toMatchObject({ status: 200, body: { status: "cutting", locationId: living } });
  });
});
