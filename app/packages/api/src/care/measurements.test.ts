import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localToday } from "@pflanzendex/core";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WAC-01: record a measurement and the "Measure" view through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `wac1-${randomUUID()}`;
const subB = `wac1-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: already October 3rd in Berlin (NFR-08).
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
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let counter = 0;
const newSpecimen = async (sub: string, name: string): Promise<string> => {
  const species = await call(sub, "POST", "/species", {
    latinName: `${name}${run} test`,
    germanName: `${name} ${run}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const e = await call(sub, "POST", "/specimens", {
    speciesId: species.body["id"],
    timeZone: "Europe/Berlin",
  });
  return e.body["id"] as string;
};
const measure = (sub: string, id: string, input: Record<string, unknown>, key?: string | null) =>
  call(sub, "POST", `/specimens/${id}/measurements`, { timeZone: "Europe/Berlin", ...input }, key);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
  // Specimens first (with their measurements): the reference to the species is on delete restrict (AB-10).
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

describe("US-WAC-01 sign-in and input", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it.each([
    ["GET", `/specimens/${id}/measurements`],
    ["POST", `/specimens/${id}/measurements`],
  ])("%s %s without token: 401", async (method, path) => {
    expect((await call(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("without Idempotency-Key: 400 with a stable error code, nothing written", async () => {
    const e = await newSpecimen(subA, "Schluessel");
    const r = await measure(subA, e, { value: 10 }, null);
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["measurements"]).toEqual(
      [],
    );
  });

  it.each([
    ["Text", { value: "zwölf" }, "value"],
    ["negativ", { value: -1 }, "value"],
    ["missing", {}, "value"],
    ["falsches Datum", { value: 10, date: "2026-02-30" }, "date"],
    ["Zukunft", { value: 10, date: "2026-10-04" }, "date"],
    ["Qualität", { value: 10, quality: "super" }, "quality"],
  ])("invalid input (%s): 400 with field, nothing written", async (_, input, field) => {
    const e = await newSpecimen(subA, `Eingabe${field}${"abcdefgh"[counter++]}`);
    const r = await measure(subA, e, input);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect(r.body["error"].details.map((d: { field: string }) => d.field)).toEqual([field]);
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["measurements"]).toEqual(
      [],
    );
  });
});

describe("US-WAC-01 record and view a measurement", () => {
  it('a specimen without measurement: "Was messen?", last measurement and rating empty', async () => {
    const e = await newSpecimen(subA, "Leer");
    expect(await call(subA, "GET", `/specimens/${e}/measurements`)).toMatchObject({
      status: 200,
      body: {
        specimenId: e,
        growthMeasure: "rosette_diameter",
        measurements: [],
        last: null,
        lastRating: null,
      },
    });
  });

  it("201 with date today (local) and quality healthy; the view shows last measurement and rating", async () => {
    const e = await newSpecimen(subA, "Erfassen");
    const r = await measure(subA, e, { value: 12.5, note: "first" });
    expect(r).toMatchObject({
      status: 201,
      body: { specimenId: e, date: "2026-10-03", value: 12.5, quality: "healthy", note: "first" },
    });
    await measure(subA, e, { value: 14, date: "2026-09-01", quality: "etiolated" });
    const a = await call(subA, "GET", `/specimens/${e}/measurements`);
    expect(a.body["last"]).toMatchObject({ date: "2026-10-03", value: 12.5 });
    expect(a.body["lastRating"]).toBe("healthy");
    expect(a.body["measurements"].map((m: { value: number }) => m.value)).toEqual([12.5, 14]);
  });

  it("US-WAC-03 the view carries rate and trend of the own measurements", async () => {
    const e = await newSpecimen(subA, "Rate");
    await measure(subA, e, { value: 10, date: "2026-01-01" });
    await measure(subA, e, { value: 11, date: "2026-01-11" });
    const a = await call(subA, "GET", `/specimens/${e}/measurements`);
    expect(a.body["growth"]).toMatchObject({ count: 2, trend: null });
    expect(a.body["growth"].ratePerYear).toBeCloseTo(36.5, 5);
  });

  it("the same time is still the previous day in New York; a back-filled date is kept", async () => {
    const e = await newSpecimen(subA, "Zeitzone");
    const ny = await measure(subA, e, { value: 5, timeZone: "America/New_York" });
    const alt = await measure(subA, e, { value: 4, date: "2026-01-02" });
    expect(ny.body["date"]).toBe("2026-10-02");
    expect(alt.body["date"]).toBe("2026-01-02");
  });

  it("same replay-protection key: no second measurement, same answer (US-QS-03)", async () => {
    const e = await newSpecimen(subA, "Idem");
    const key = randomUUID();
    const a = await measure(subA, e, { value: 9 }, key);
    const b = await measure(subA, e, { value: 9 }, key);
    expect(b).toMatchObject({ status: 201, body: { id: a.body["id"] } });
    expect(
      (await call(subA, "GET", `/specimens/${e}/measurements`)).body["measurements"],
    ).toHaveLength(1);
    const conflict = await measure(subA, e, { value: 10 }, key);
    expect(conflict).toMatchObject({
      status: 409,
      body: { error: { code: "idempotency.key_conflict" } },
    });
  });
});

describe("US-WAC-02 assess etiolation while measuring", () => {
  it("the view carries the etiolation signs of the species; healthy is the default quality", async () => {
    const e = await newSpecimen(subA, "Anzeichen");
    expect(await call(subA, "GET", `/specimens/${e}/measurements`)).toMatchObject({
      status: 200,
      body: { etiolationSigns: "Rosette streckt sich." },
    });
    expect((await measure(subA, e, { value: 6 })).body["quality"]).toBe("healthy");
    const thin = await measure(subA, e, { value: 7, quality: "etiolated" });
    expect(thin).toMatchObject({ status: 201, body: { quality: "etiolated" } });
    expect((await call(subA, "GET", `/specimens/${e}/measurements`)).body["lastRating"]).toBe(
      "etiolated",
    );
  });

  it("tenant: another account gets neither the view nor the signs of a foreign specimen", async () => {
    const annas = await newSpecimen(subA, "Anzeichenfremd");
    const r = await call(subB, "GET", `/specimens/${annas}/measurements`);
    expect(r.status).toBe(404);
    expect(r.body).not.toHaveProperty("etiolationSigns");
  });
});

describe("US-WAC-01 Mandantentrennung (P-04)", () => {
  it("a foreign or unknown specimen: 404 on measuring and on reading, nothing written", async () => {
    const bens = await newSpecimen(subB, "Ben");
    const unknown = randomUUID();
    for (const id of [bens, unknown]) {
      expect(await measure(subA, id, { value: 10 })).toMatchObject({
        status: 404,
        body: { error: { code: "specimen.not_found" } },
      });
      expect(await call(subA, "GET", `/specimens/${id}/measurements`)).toMatchObject({
        status: 404,
        body: { error: { code: "specimen.not_found" } },
      });
    }
    expect(
      (await call(subB, "GET", `/specimens/${bens}/measurements`)).body["measurements"],
    ).toEqual([]);
  });

  it("measurements of one account never appear in the view of another", async () => {
    const annas = await newSpecimen(subA, "Anna");
    await measure(subA, annas, { value: 7 });
    expect(await call(subB, "GET", `/specimens/${annas}/measurements`)).toMatchObject({
      status: 404,
    });
  });
});

describe("US-WAC-01 Systemuhr", () => {
  it("without an injected clock the system time applies: the date is today and not in the future", async () => {
    const real = createApp({ reviewer, pool });
    const send = async (path: string, body: unknown) => {
      const res = await real.request(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer valid:${subA}`,
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify(body),
      });
      return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    const species = await send("/species", {
      latinName: `Systemuhr${run} test`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "height",
      etiolationSigns: "Streckt sich.",
      successCriteria: "Kompakt.",
    });
    const specimen = await send("/specimens", { speciesId: species["id"], timeZone: "UTC" });
    const measurement = await send(`/specimens/${specimen["id"]}/measurements`, {
      value: 3,
      timeZone: "UTC",
    });
    expect(measurement["date"]).toBe(localToday(new Date(), "UTC"));
  });
});

describe("US-WAC-01 last measurement on the specimen card (US-BES-06)", () => {
  const cardOf = async (sub: string, id: string) =>
    (await call(sub, "GET", "/specimens/cards?timeZone=Europe%2FBerlin")).body["cards"].find(
      (k: { id: string }) => k.id === id,
    );

  it("without an own measurement: no measurement yet (unknown, P-08)", async () => {
    const id = await newSpecimen(subA, "Cardempty");
    expect(await cardOf(subA, id)).toMatchObject({ lastMeasurement: null, photo: null });
  });

  it("the card shows value, date, quality and note of the last measurement, the photo stays null", async () => {
    const id = await newSpecimen(subA, "Cardfull");
    await measure(subA, id, { value: 10, date: "2026-09-20" });
    await measure(subA, id, {
      value: 14.5,
      date: "2026-10-01",
      quality: "etiolated",
      note: "lang",
    });
    expect(await cardOf(subA, id)).toMatchObject({
      lastMeasurement: { date: "2026-10-01", value: 14.5, quality: "etiolated", note: "lang" },
      photo: null,
    });
  });

  it("tenant: the card of an account never carries a measurement of another", async () => {
    const annas = await newSpecimen(subA, "Carda");
    const bens = await newSpecimen(subB, "Cardb");
    await measure(subA, annas, { value: 21 });
    expect(await cardOf(subB, bens)).toMatchObject({ lastMeasurement: null });
    expect(await cardOf(subB, annas)).toBeUndefined();
  });
});
