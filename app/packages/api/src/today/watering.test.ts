import { randomUUID } from "node:crypto";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";
import { reminderOccasionsFor } from "./index";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-MON-05: watering by interval without a sensor (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: account ids and cleanup (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `wat-${randomUUID()}`;
const subB = `wat-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, s] = token.split(":");
  return kind === "valid"
    ? { sub: s, email: `${s}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-03 in Berlin: the day the plants are caught.
let now = new Date("2026-10-03T10:00:00Z");
let app: ReturnType<typeof createApp>;
let account = "";
let plant = "";
let noInterval = "";
let cutting = "";
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) } as Response;
}
const due = async (sub = subA) =>
  ((await call(sub, "GET", "/watering/due?timeZone=Europe/Berlin")).body["due"] as {
    specimenId: string;
    daysSince: number;
    lastWateredOn: string | null;
  }[]) ?? [];
const species = async (name: string, extra = {}) =>
  (
    await call(subA, "POST", "/species", {
      latinName: `${name}${run} test`,
      germanName: `${name} ${run}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      ...extra,
    })
  ).body["id"] as string;
const specimen = async (speciesId: string, marker: string, extra = {}) =>
  (
    await call(subA, "POST", "/specimens", {
      speciesId,
      marker,
      timeZone: "Europe/Berlin",
      ...extra,
    })
  ).body["id"] as string;
const at = (day: string) => {
  now = new Date(`${day}T10:00:00Z`);
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => now });
  await call(subA, "PUT", "/account/profile", {
    displayName: "Gießen",
    timeZone: "Europe/Berlin",
    everythingPrivate: false,
    noRecommendations: false,
    notifications: {},
    replenishBuffer: null,
  });
  account = (await admin.query("select id from account where subject = $1", [subA])).rows[0].id;
  const sunny = await species("Gießen", { dormancyFrom: "11-01", dormancyUntil: "03-15" });
  const plain = await species("Ohne");
  await call(subA, "PUT", `/care-profiles/${sunny}`, {
    wateringGrowthDays: 7,
    wateringDormancyDays: 21,
  });
  plant = await specimen(sunny, "gießen");
  noInterval = await specimen(plain, "ohne");
  cutting = await specimen(sunny, "steckling", { status: "cutting" });
  await call(subB, "PUT", "/account/profile", {
    displayName: "Ben",
    timeZone: "Europe/Berlin",
    everythingPrivate: false,
    noRecommendations: false,
    notifications: {},
    replenishBuffer: null,
  });
});
afterAll(async () => {
  await admin.query("delete from specimen where account_id = $1", [account]);
  await admin.query("delete from care_profile where account_id = $1", [account]);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id = $1)`,
    [account],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await Promise.all([pool.end(), admin.end()]);
});

describe("US-MON-05 watering by interval", () => {
  it("US-MON-05 answers 401 without a token", async () => {
    expect((await call(null, "GET", "/watering/due?timeZone=UTC")).status).toBe(401);
    expect((await call(null, "POST", "/watering", {})).status).toBe(401);
  });

  it("US-MON-05 refuses a missing time zone with 400", async () => {
    expect((await call(subA, "GET", "/watering/due")).status).toBe(400);
  });

  it("US-MON-05 is due only after the interval of the phase from the catch date; cutting and plant without interval never (P-08)", async () => {
    at("2026-10-09");
    expect(await due()).toEqual([]);
    at("2026-10-10");
    const list = await due();
    expect(list.map((d) => d.specimenId)).toEqual([plant]);
    expect(list[0]).toMatchObject({ daysSince: 7, lastWateredOn: null });
    expect(list.map((d) => d.specimenId)).not.toContain(noInterval);
    expect(list.map((d) => d.specimenId)).not.toContain(cutting);
  });

  it("US-MON-05 the reminder contains the same plant (FR-MON-03) and says the next action", async () => {
    at("2026-10-10");
    const source = reminderOccasionsFor(pool, {
      measurements: { forSpecimens: async () => new Map() },
      zoneStock: { stock: async () => [] },
    });
    const o = (await source.occasions(account, "Europe/Berlin", now)).find(
      (i) => i.id === `watering:${plant}`,
    );
    expect(o).toMatchObject({ occasion: "watering" });
    expect(o?.nextAction).toContain("als gegossen ein");
  });

  it("US-MON-05 'watered' writes a log entry for today, the plant is no longer due, and a repeat writes once", async () => {
    at("2026-10-10");
    const first = await call(subA, "POST", "/watering", {
      specimenIds: [plant],
      timeZone: "Europe/Berlin",
    });
    expect(first).toMatchObject({ status: 200, body: { date: "2026-10-10", created: 1 } });
    expect(
      (await call(subA, "POST", "/watering", { specimenIds: [plant], timeZone: "Europe/Berlin" }))
        .body["created"],
    ).toBe(0);
    expect(await due()).toEqual([]);
    at("2026-10-16");
    expect(await due()).toEqual([]);
    at("2026-10-17");
    expect((await due())[0]).toMatchObject({ specimenId: plant, lastWateredOn: "2026-10-10" });
  });

  it("US-MON-05 in the dormancy phase the longer interval of that phase counts", async () => {
    await call(subA, "POST", "/watering", { specimenIds: [plant], timeZone: "Europe/Berlin" });
    at("2026-10-17"); // growth: 7 days after the entry of 2026-10-17 is not yet due
    at("2026-11-08"); // dormancy since 1 November: 22 days after 2026-10-17
    expect((await due()).map((d) => d.specimenId)).toEqual([plant]);
    at("2026-11-06"); // dormancy: only 20 days, interval is 21
    expect(await due()).toEqual([]);
  });

  it("US-MON-05 several specimens in one step; an unknown one stops the step; a foreign account sees nothing (P-04)", async () => {
    at("2026-11-08");
    const many = await call(subA, "POST", "/watering", {
      specimenIds: [plant, noInterval],
      timeZone: "Europe/Berlin",
    });
    expect(many).toMatchObject({ status: 200, body: { created: 2 } });
    const unknown = await call(subA, "POST", "/watering", {
      specimenIds: [plant, randomUUID()],
      timeZone: "Europe/Berlin",
    });
    expect(unknown).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    const foreign = await call(subB, "POST", "/watering", {
      specimenIds: [plant],
      timeZone: "Europe/Berlin",
    });
    expect(foreign).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    expect(await due(subB)).toEqual([]);
  });
});
