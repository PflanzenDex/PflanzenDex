import { randomUUID } from "node:crypto";
import type { MeasurementSource, TargetLocationSource, TreatmentSource } from "@pflanzendex/core";
import { SpeciesPostgres, migrate, openEnsuredOwnerPool, openFixturePool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";
import { measurementSourceFor, targetLocationFor, treatmentSourceFor } from "./source";

// Contract of the ports `MeasurementSource`, `TreatmentSource` and `TargetLocationSource` (ADR 0003, FR-QG-19), run
// against the real adapters (real PostgreSQL, `make db-up`). The lower module `collection` defines the ports, `care`
// implements them. Common to all: they answer only for the account that asks (P-04) and leave out what is unknown.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
let app: ReturnType<typeof createApp>;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `contract-${randomUUID()}`;
const subB = `contract-${randomUUID()}`;
const verifier: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string, method: string, path: string, body?: unknown): Promise<Json> {
  const res = await app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer valid:${sub}`,
      "idempotency-key": randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await res.json()) as Json;
}

const accountOf = async (sub: string) =>
  (await admin.query<{ id: string }>("select id from account where subject = $1", [sub])).rows[0]
    ?.id as string;
const newSpecies = async (sub: string, name: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: `${name}${run} test`,
      germanName: `${name} ${run}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  )["id"] as string;
const newSpecimen = async (sub: string, speciesId: string) =>
  (await call(sub, "POST", "/specimens", { speciesId, timeZone: "Europe/Berlin" }))["id"] as string;

let [userA, userB] = ["", ""];
let speciesA = "";
let specimenWith = ""; // of A: one measurement and one open treatment
let specimenWithout = ""; // of A: neither
let specimenOfB = "";
let locationA = "";

beforeAll(async () => {
  pool = await openEnsuredOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer: verifier, pool });
  speciesA = await newSpecies(subA, "Vertrag");
  const speciesB = await newSpecies(subB, "Vertragb");
  specimenWith = await newSpecimen(subA, speciesA);
  specimenWithout = await newSpecimen(subA, speciesA);
  specimenOfB = await newSpecimen(subB, speciesB);
  await call(subA, "POST", `/specimens/${specimenWith}/measurements`, {
    timeZone: "Europe/Berlin",
    date: "2026-10-01",
    value: 12.5,
  });
  await call(subA, "POST", "/treatments", {
    specimenIds: [specimenWith],
    reason: "Wollläuse",
    date: "2026-10-10",
  });
  await call(subB, "POST", `/specimens/${specimenOfB}/measurements`, {
    timeZone: "Europe/Berlin",
    date: "2026-10-01",
    value: 3,
  });
  locationA = (
    await call(subA, "POST", "/locations", {
      name: `Fenster ${run}`,
      kind: "indoor",
      lightZoneId: null,
    })
  )["id"] as string;
  await call(subA, "PUT", `/care-profiles/${speciesA}`, { growthLocationId: locationA });
  [userA, userB] = [await accountOf(subA), await accountOf(subB)];
});
afterAll(async () => {
  const subs = [[subA, subB]];
  const owned = "account_id in (select id from account where subject = any($1))";
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

describe("MeasurementSource contract · care adapter", () => {
  const source = (): MeasurementSource => measurementSourceFor(pool);

  it("no specimens: empty answer", async () => {
    expect((await source().forSpecimens(userA, [])).size).toBe(0);
  });

  it("names the last measurement of an own specimen and leaves out one without a measurement", async () => {
    const r = await source().forSpecimens(userA, [specimenWith, specimenWithout]);
    expect([...r.keys()]).toEqual([specimenWith]);
    expect(r.get(specimenWith)?.last).toMatchObject({ date: "2026-10-01", value: 12.5 });
  });

  it("specimens of another account are left out (P-04)", async () => {
    expect((await source().forSpecimens(userA, [specimenOfB])).size).toBe(0);
    expect([...(await source().forSpecimens(userB, [specimenWith, specimenOfB])).keys()]).toEqual([
      specimenOfB,
    ]);
  });
});

describe("TreatmentSource contract · care adapter", () => {
  const source = (): TreatmentSource => treatmentSourceFor(pool);

  it("no specimens: empty answer", async () => {
    expect((await source().open(userA, [])).size).toBe(0);
  });

  it("names the open treatments of an own specimen and leaves out one without", async () => {
    const r = await source().open(userA, [specimenWith, specimenWithout]);
    expect([...r.keys()]).toEqual([specimenWith]);
    expect(r.get(specimenWith)).toEqual([
      { id: expect.any(String), reason: "Wollläuse", dueAt: "2026-10-10" },
    ]);
  });

  it("specimens of another account are left out (P-04)", async () => {
    expect((await source().open(userB, [specimenWith])).size).toBe(0);
  });
});

describe("TargetLocationSource contract · care adapter", () => {
  const source = (): TargetLocationSource => targetLocationFor(pool);
  const species = async (user: string, id: string) => {
    const found = await new SpeciesPostgres(pool).find(user, id);
    if (!found) throw new Error("species not visible");
    return found;
  };

  it("names the growth location of the own care profile, also as target in the growth phase", async () => {
    const s = await species(userA, speciesA);
    expect(await source().growthLocation(userA, s)).toBe(locationA);
    expect(await source().targetLocation(userA, s, "2026-07-01")).toBe(locationA);
  });

  it("is null (unknown) for an account without a care profile for the species (P-04)", async () => {
    const s = await species(userA, speciesA);
    expect(await source().growthLocation(userB, s)).toBeNull();
    expect(await source().targetLocation(userB, s, "2026-07-01")).toBeNull();
  });
});
