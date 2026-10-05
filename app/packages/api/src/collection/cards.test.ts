import { randomUUID } from "node:crypto";
import type { TreatmentSource, CardMeasurementView, MeasurementSource } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-06: specimens as cards through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes6-${randomUUID()}`;
const subB = `bes6-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: already October 3rd in Berlin (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

// State of the WAC and BEH ports: they do not exist yet, the tests use stubs that may only answer for the specimens of the
// asking account.
const asked: { port: string; userId: string; ids: readonly string[] }[] = [];
let measurementsFor: Record<string, CardMeasurementView> = {};
let treatmentFor: Record<string, { id: string; reason: string; dueAt: string }[]> = {};
const measurements: MeasurementSource = {
  forSpecimens: async (userId, ids) => {
    asked.push({ port: "measurements", userId, ids });
    return new Map(
      ids.flatMap((id) => (measurementsFor[id] ? [[id, measurementsFor[id]] as const] : [])),
    );
  },
};
const treatments: TreatmentSource = {
  open: async (userId, ids) => {
    asked.push({ port: "treatments", userId, ids });
    return new Map(
      ids.flatMap((id) => (treatmentFor[id] ? [[id, treatmentFor[id]] as const] : [])),
    );
  },
};
let app: ReturnType<typeof createApp>;
let appWithoutPorts: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  a = app,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await a.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const cards = (sub: string | null, timeZone: string | null = "Europe/Berlin", a = app) =>
  call(
    sub,
    "GET",
    `/specimens/cards${timeZone ? `?timeZone=${encodeURIComponent(timeZone)}` : ""}`,
    undefined,
    a,
  );

const newSpecies = async (sub: string, name: string, german: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: german,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const create = (sub: string, input: Record<string, unknown>) =>
  call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", ...input });

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW, measurements, treatments });
  appWithoutPorts = createApp({ reviewer, pool, clock: () => NOW });
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

describe("US-BES-06 cards: sign-in and input", () => {
  it("GET /specimens/cards without token: 401", async () => {
    expect((await cards(null)).status).toBe(401);
  });

  it("without or with unknown time zone: 400 input.invalid, no guessing (NFR-08)", async () => {
    for (const timeZone of [null, "Mars/Olympus", "+02:00"]) {
      const r = await cards(subA, timeZone);
      expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    }
  });

  it('the route "cards" is not read as the ID of a specimen', async () => {
    expect((await cards(subA)).status).toBe(200);
  });
});

describe("US-BES-06 Karten: Inhalt", () => {
  it("shows name, species, status, location and light zone; without measurement and treatment the fields stay empty", async () => {
    const speciesId = await newSpecies(subA, `Aloe${run} vera`, `Aloe ${run}`);
    const zone = await call(subA, "POST", "/light-zones", {
      name: `Zone ${run}`,
      luxCeiling: 30000,
    });
    const location = await call(subA, "POST", "/locations", {
      name: `Regal ${run}`,
      kind: "indoor",
      lightZoneId: zone.body["id"],
    });
    await create(subA, { speciesId, locationId: location.body["id"] });
    const r = await cards(subA);
    expect(r.status).toBe(200);
    expect(r.body["cards"]).toHaveLength(1);
    expect(r.body["cards"][0]).toMatchObject({
      name: `Aloe ${run}`,
      speciesName: `Aloe ${run}`,
      status: "plant",
      location: `Regal ${run}`,
      lightZone: `Zone ${run}`,
      caughtAt: "2026-10-03",
      photo: null,
      lastMeasurement: null,
      treatment: null,
      moreTreatments: 0,
    });
  });

  it('without a location the card is "unknown" (null) for location and light zone', async () => {
    const speciesId = await newSpecies(subA, `Agave${run} utah`, `Agave ${run}`);
    const e = await create(subA, { speciesId });
    const card = (await cards(subA)).body["cards"].find(
      (k: { id: string }) => k.id === e.body["id"],
    );
    expect(card).toMatchObject({ location: null, lightZone: null });
  });

  it('measurement, photo and open treatments come from the ports; "today" follows the time zone of the user', async () => {
    const speciesId = await newSpecies(subA, `Yucca${run} rostrata`, `Yucca ${run}`);
    const e = await create(subA, { speciesId });
    const id = e.body["id"] as string;
    measurementsFor = {
      [id]: {
        last: { date: "2026-10-01", value: 12.5, quality: "etiolated", note: "Streckt sich." },
        photo: { url: "/medien/x.jpg", date: "2026-09-28" },
      },
    };
    treatmentFor = {
      [id]: [
        { id: "b2", reason: "Umtopfen", dueAt: "2026-10-09" },
        { id: "b1", reason: "Neem spritzen", dueAt: "2026-10-02" },
      ],
    };
    const berlin = (await cards(subA)).body["cards"].find((k: { id: string }) => k.id === id);
    expect(berlin).toMatchObject({
      lastMeasurement: {
        date: "2026-10-01",
        value: 12.5,
        quality: "etiolated",
        note: "Streckt sich.",
      },
      photo: { url: "/medien/x.jpg", date: "2026-09-28" },
      treatment: {
        reason: "Neem spritzen",
        dueDate: { kind: "overdue", text: "überfällig seit 1 Tg." },
      },
      moreTreatments: 1,
    });
    // The same clock is still 2 October in New York: the treatment is due today there.
    const ny = (await cards(subA, "America/New_York")).body["cards"].find(
      (k: { id: string }) => k.id === id,
    );
    expect(ny.treatment.dueDate).toMatchObject({ kind: "today", text: "heute fällig" });
    measurementsFor = {};
    treatmentFor = {};
  });

  it("without connected ports (the case today): no measurement yet, no treatment, no error", async () => {
    const r = await cards(subA, "Europe/Berlin", appWithoutPorts);
    expect(r.status).toBe(200);
    for (const k of r.body["cards"])
      expect(k).toMatchObject({ lastMeasurement: null, treatment: null });
  });
});

describe("US-BES-06 Karten: Mandant", () => {
  it("an account sees only cards of its own specimens; the ports never learn foreign IDs", async () => {
    const speciesId = await newSpecies(subB, `Opuntia${run} ficus`, `Opuntia ${run}`);
    const bens = await create(subB, { speciesId });
    asked.length = 0;
    const annas = await cards(subA);
    expect(annas.body["cards"].map((k: { id: string }) => k.id)).not.toContain(bens.body["id"]);
    expect(JSON.stringify(annas.body)).not.toContain(`Opuntia ${run}`);
    const forBen = await cards(subB);
    expect(forBen.body["cards"].map((k: { id: string }) => k.id)).toContain(bens.body["id"]);
    for (const g of asked.filter((x) => x.userId === subA))
      expect(g.ids).not.toContain(bens.body["id"]);
  });

  it("an account without specimens gets an empty list", async () => {
    expect((await cards(`bes6-${randomUUID()}`)).body["cards"]).toEqual([]);
  });
});

describe("US-ACC-03 cheap specimen count for the start page", () => {
  const count = (sub: string | null) => call(sub, "GET", "/specimens/count");

  it("GET /specimens/count without token: 401", async () => {
    expect((await count(null)).status).toBe(401);
  });

  it("US-ACC-03 counts the active specimens of the caller, never those of another account (P-04), and is not read as a specimen ID", async () => {
    const before = (await count(subB)).body["count"] as number;
    const speciesId = await newSpecies(subB, `Zaehla${run} vera`, `Zähler ${run}`);
    await create(subB, { speciesId, name: `Zähler eins ${run}` });
    await create(subB, { speciesId, name: `Zähler zwei ${run}`, marker: "rot" });
    expect(await count(subB)).toMatchObject({ status: 200, body: { count: before + 2 } });
    expect((await count(subA)).body["count"]).toBe((await cards(subA)).body["cards"].length);
  });

  it("US-ACC-03 counts archived specimens apart, so an account with only archived plants is no new account (#291)", async () => {
    const before = (await count(subB)).body as { count: number; archived: number };
    const speciesId = await newSpecies(subB, `Archiva${run} vera`, `Archiv ${run}`);
    const made = await create(subB, { speciesId, name: `Archiv eins ${run}` });
    const id = made.body["id"] as string;
    const archived = await call(subB, "POST", `/specimens/${id}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "eingegangen",
    });
    expect(archived.status).toBe(200);
    expect(await count(subB)).toMatchObject({
      status: 200,
      body: { count: before.count, archived: before.archived + 1 },
    });
    expect(typeof (await count(subA)).body["archived"]).toBe("number");
  });
});
