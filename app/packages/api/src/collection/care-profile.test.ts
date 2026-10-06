import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-09: the own care profile through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes9-${randomUUID()}`;
const subB = `bes9-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const NOW = new Date("2026-10-04T12:00:00Z"); // growth phase by the catalog (dormancy 11-01 to 03-15)
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
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
  const parsed = (await res.json().catch(() => ({}))) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: parsed };
}

const newSpecies = async (sub: string, name: string, extra: Record<string, unknown> = {}) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 10000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
      ...extra,
    })
  ).body["id"] as string;
const location = async (sub: string, name: string) =>
  (await call(sub, "POST", "/locations", { name, kind: "indoor", lightZoneId: null })).body[
    "id"
  ] as string;
const zone = async (sub: string, name: string, ceiling: number) =>
  (await call(sub, "POST", "/light-zones", { name, luxCeiling: ceiling, ppfd: null })).body[
    "id"
  ] as string;
const specimen = async (sub: string, speciesId: string, extra: Record<string, unknown> = {}) =>
  (await call(sub, "POST", "/specimens", { speciesId, timeZone: "Europe/Berlin", ...extra })).body;
const put = (sub: string | null, speciesId: string, body: unknown, key?: string) =>
  call(sub, "PUT", `/care-profiles/${speciesId}`, body, key);
const entries = async (sub: string) =>
  (await call(sub, "GET", "/care-profiles")).body["entries"] as {
    speciesId: string;
    speciesName: string;
    activeSpecimens: number;
    deviates: boolean;
    profile: Record<string, { catalog: unknown; own: unknown; effective: unknown; source: string }>;
  }[];

let speciesA: string;
let foreignSpecies: string;
let living: string;
let cold: string;
let foreignLocation: string;
let zoneLow: string;
let zoneHigh: string;
let foreignZone: string;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
  speciesA = await newSpecies(subA, `Winter${run}`);
  foreignSpecies = await newSpecies(subB, `Geheim${run}`);
  living = await location(subA, `Wohnzimmer ${run}`);
  cold = await location(subA, `Kühler Flur ${run}`);
  foreignLocation = await location(subB, `Bens Flur ${run}`);
  zoneLow = await zone(subA, `Niedrig ${run}`, 5000);
  zoneHigh = await zone(subA, `Hoch ${run}`, 60000);
  foreignZone = await zone(subB, `Bens Zone ${run}`, 20000);
});
afterAll(async () => {
  const subs = [[subA, subB]];
  const owned = "account_id in (select id from account where subject = any($1))";
  // Profiles and specimens first: both reference the species on delete restrict (AB-10).
  await admin.query(`delete from care_profile where ${owned}`, subs);
  await admin.query(`delete from specimen where ${owned}`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where ${owned})`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

describe("US-BES-09 care profile through the API", () => {
  it("US-BES-09 without token: 401 for reading and writing", async () => {
    expect((await call(null, "GET", "/care-profiles")).status).toBe(401);
    expect((await put(null, speciesA, { growthLocationId: living })).status).toBe(401);
  });

  it("US-BES-09 lists the species with an active specimen with the catalog value and, once set, my deviation", async () => {
    await specimen(subA, speciesA, { marker: "Eins" });
    const before = (await entries(subA)).find((e) => e.speciesId === speciesA);
    expect(before).toMatchObject({ activeSpecimens: 1, deviates: false });
    expect(before?.profile["dormancy"]).toMatchObject({
      catalog: { from: "11-01", until: "03-15" },
      own: null,
      source: "catalog",
    });
    expect(before?.profile["lightZone"]?.catalog).not.toBeNull();
    expect(before?.profile["growthLocation"]).toMatchObject({ effective: null, source: "unknown" });

    const set = await put(subA, speciesA, {
      growthLocationId: living,
      dormancyLocationId: cold,
      dormancyFrom: "10-15",
      dormancyUntil: "02-28",
      wateringGrowthDays: 7,
      lightZoneId: zoneLow,
      ownHints: "Im Winter trocken.",
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ speciesId: speciesA, growthLocationId: living });
    const after = (await entries(subA)).find((e) => e.speciesId === speciesA);
    expect(after?.deviates).toBe(true);
    expect(after?.profile["dormancy"]).toMatchObject({
      catalog: { from: "11-01", until: "03-15" },
      own: { from: "10-15", until: "02-28" },
      source: "profile",
    });
    expect(after?.profile["lightZone"]).toMatchObject({ own: zoneLow, effective: zoneLow });
  });

  it("US-BES-09 reset to catalog per field: null clears only that field, the species is untouched", async () => {
    const r = await put(subA, speciesA, { lightZoneId: null });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      lightZoneId: null,
      growthLocationId: living,
      wateringGrowthDays: 7,
    });
    const species = await call(subA, "GET", `/species/${speciesA}`);
    expect(species.body).toMatchObject({ dormancyFrom: "11-01", dormancyUntil: "03-15" });
  });

  it("US-BES-09 an empty care profile is valid: everything reset, the catalog applies again", async () => {
    const reset = await put(subA, speciesA, {
      growthLocationId: null,
      dormancyLocationId: null,
      dormancyFrom: null,
      dormancyUntil: null,
      wateringGrowthDays: null,
      ownHints: null,
    });
    expect(reset.status).toBe(200);
    const e = (await entries(subA)).find((x) => x.speciesId === speciesA);
    expect(e?.deviates).toBe(false);
    expect(e?.profile["dormancy"]).toMatchObject({ own: null, source: "catalog" });
    await put(subA, speciesA, { growthLocationId: living, dormancyLocationId: cold });
  });

  it("US-BES-09 validation: catalog fields, a typed location, half a dormancy, an empty request: 400 with the field", async () => {
    for (const body of [
      { latinName: "Anders" },
      { growthLocationId: "Wohnzimmer" },
      { dormancyFrom: "11-01" },
      { wateringGrowthDays: 0 },
      {},
    ]) {
      const r = await put(subA, speciesA, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
    }
  });

  it("US-BES-09 a location or zone of another account is 404 and writes nothing (P-04)", async () => {
    const l = await put(subA, speciesA, { growthLocationId: foreignLocation });
    expect([l.status, l.body["error"].code]).toEqual([404, "location.not_found"]);
    const z = await put(subA, speciesA, { lightZoneId: foreignZone });
    expect([z.status, z.body["error"].code]).toEqual([404, "light_zone.not_found"]);
    const e = (await entries(subA)).find((x) => x.speciesId === speciesA);
    expect(e?.profile["growthLocation"]?.own).toBe(living);
  });

  it("US-BES-09 a private species of another account looks like an unknown one: 404", async () => {
    const r = await put(subA, foreignSpecies, { growthLocationId: living });
    expect([r.status, r.body["error"].code]).toEqual([404, "species.not_found"]);
  });

  it("US-BES-09 the same Idempotency-Key answers the same; a different body under it is refused", async () => {
    const key = randomUUID();
    const a = await put(subA, speciesA, { wateringDormancyDays: 21 }, key);
    const b = await put(subA, speciesA, { wateringDormancyDays: 21 }, key);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toEqual(a.body);
    const c = await put(subA, speciesA, { wateringDormancyDays: 28 }, key);
    expect([c.status, c.body["error"].code]).toEqual([409, "idempotency.key_conflict"]);
    expect((await put(subA, speciesA, { wateringDormancyDays: 21 }, "")).status).toBe(400);
  });

  it("US-BES-09 my profile is private: another account sees no deviation and cannot change mine (P-05)", async () => {
    expect((await entries(subB)).find((x) => x.speciesId === speciesA)).toBeUndefined();
    const own = await newSpecies(subB, `Eigen${run}`);
    await specimen(subB, own);
    const bens = (await entries(subB)).map((e) => e.speciesId);
    expect(bens).toEqual([own]);
    const attack = await put(subB, speciesA, { growthLocationId: living });
    expect([attack.status, attack.body["error"].code]).toEqual([404, "species.not_found"]);
    const mine = (await entries(subA)).find((x) => x.speciesId === speciesA);
    expect(mine?.profile["growthLocation"]?.own).toBe(living);
  });

  it("US-BES-09 the zone of a care profile cannot be deleted unnoticed: 409 light_zone.in_use names the species", async () => {
    await put(subA, speciesA, { lightZoneId: zoneHigh });
    const blocked = await call(subA, "DELETE", `/light-zones/${zoneHigh}`);
    expect([blocked.status, blocked.body["error"].code]).toEqual([409, "light_zone.in_use"]);
    expect(JSON.stringify(blocked.body["error"].data)).toContain(`Winter${run}`);
    await put(subA, speciesA, { lightZoneId: null });
    expect((await call(subA, "DELETE", `/light-zones/${zoneHigh}`)).status).toBe(200);
  });

  it("US-BES-09 a species with only archived specimens drops out of the list (US-BES-07)", async () => {
    const lone = await newSpecies(subA, `Archiv${run}`);
    const z = await specimen(subA, lone);
    expect((await entries(subA)).some((e) => e.speciesId === lone)).toBe(true);
    await call(subA, "POST", `/specimens/${z["id"]}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "eingegangen",
    });
    expect((await entries(subA)).some((e) => e.speciesId === lone)).toBe(false);
  });
});

describe("US-BES-09 the profile drives phases, moves and new specimens", () => {
  it("US-BES-09 end to end: phase list shows my target, 'Jetzt umgestellt' moves, the hint 'location missing' is gone", async () => {
    const species = await newSpecies(subA, `Strecke${run}`);
    const z = await specimen(subA, species, { marker: "Eins" });
    const row = async () =>
      (
        (await call(subA, "GET", "/care-phases?timeZone=UTC")).body["phases"] as {
          specimenId: string;
          locationId: string | null;
          targetLocationId: string | null;
          phase: string;
        }[]
      ).find((p) => p.specimenId === z["id"]);
    const hints = async () =>
      (
        (await call(subA, "GET", "/specimens/hints")).body["hints"] as {
          specimenId: string;
          kind: string;
        }[]
      )
        .filter((h) => h.specimenId === z["id"])
        .map((h) => h.kind);

    expect(await row()).toMatchObject({ phase: "growth", targetLocationId: null });
    expect(await hints()).toContain("location_missing");
    const refused = await call(subA, "POST", "/care-phases/confirm", {
      specimenIds: [z["id"]],
      timeZone: "UTC",
    });
    expect([refused.status, refused.body["error"].code]).toEqual([409, "care.target_unknown"]);

    await put(subA, species, { growthLocationId: living, dormancyLocationId: cold });
    expect(await row()).toMatchObject({ locationId: null, targetLocationId: living });

    const moved = await call(subA, "POST", "/care-phases/confirm", {
      specimenIds: [z["id"]],
      timeZone: "UTC",
    });
    expect(moved.status).toBe(200);
    expect(moved.body["specimens"]).toEqual([
      { specimenId: z["id"], locationId: living, changed: true },
    ]);
    expect(await row()).toMatchObject({ locationId: living, targetLocationId: living });
    expect(await hints()).not.toContain("location_missing");
  });

  it("US-BES-09 my dormancy period replaces the catalog's: the phase changes on the same day", async () => {
    const species = await newSpecies(subA, `Ruhe${run}`);
    const z = await specimen(subA, species, { marker: "Eins" });
    const phase = async () =>
      (
        (await call(subA, "GET", "/care-phases?timeZone=UTC")).body["phases"] as {
          specimenId: string;
          phase: string;
          targetLocationId: string | null;
        }[]
      ).find((p) => p.specimenId === z["id"]);
    await put(subA, species, { growthLocationId: living, dormancyLocationId: cold });
    expect(await phase()).toMatchObject({ phase: "growth", targetLocationId: living });
    await put(subA, species, { dormancyFrom: "09-01", dormancyUntil: "11-30" });
    expect(await phase()).toMatchObject({ phase: "dormancy", targetLocationId: cold });
    await put(subA, species, { dormancyFrom: null, dormancyUntil: null });
    expect(await phase()).toMatchObject({ phase: "growth", targetLocationId: living });
  });

  it("US-BES-09 another account's phase list is untouched by my profile (P-05)", async () => {
    const bens = (await call(subB, "GET", "/care-phases?timeZone=UTC")).body["phases"] as {
      targetLocationId: string | null;
    }[];
    expect(bens.every((p) => p.targetLocationId === null)).toBe(true);
  });

  it("US-BES-09 my zone override changes where the species counts in the light distribution (FR-BES-10)", async () => {
    const species = await newSpecies(subA, `Licht${run}`);
    await specimen(subA, species, { marker: "Eins" });
    const cutting = async () =>
      (await call(subA, "GET", "/specimens/distribution")).body["distribution"].notCounted
        .cuttingLight as number;
    const before = await cutting();
    await put(subA, species, { lightZoneId: zoneLow });
    expect(await cutting()).toBe(before + 1);
    await put(subA, species, { lightZoneId: null });
    expect(await cutting()).toBe(before);
  });

  it("US-BES-09 a new specimen without a chosen location is placed at my growth location (US-BES-02, FR-PHA-05)", async () => {
    const species = await newSpecies(subA, `Neu${run}`);
    await put(subA, species, { growthLocationId: living });
    const z = await specimen(subA, species, { marker: "Eins" });
    expect(z).toMatchObject({ locationId: living });
  });
});
