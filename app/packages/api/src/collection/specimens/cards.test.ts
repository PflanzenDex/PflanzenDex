import { randomUUID } from "node:crypto";
import type { TreatmentSource, CardMeasurementView, MeasurementSource } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-06: specimens as cards through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes6-${randomUUID()}`;
const subB = `bes6-${randomUUID()}`;
// NFR-12 / FR-BES-23: a large account (1,000 plants), a small shop with known dates, and a stranger to both.
const subC = `bes6-${randomUUID()}`;
const subD = `bes6-${randomUUID()}`;
const subE = `bes6-${randomUUID()}`;
const subjects = [subA, subB, subC, subD, subE];
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
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW, measurements, treatments });
  appWithoutPorts = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
  // Specimens first: the reference to the species is on delete restrict (AB-10).
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [subjects],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [subjects],
  );
  await admin.query("delete from account where subject = any($1)", [subjects]);
  await pool.end();
  await admin.end();
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

  it("US-BES-06 · #592 without a zone at the location the card shows the zone of the species and says so", async () => {
    for (const [name, luxCeiling] of [
      [`Steck ${run}`, 1500],
      [`Hell ${run}`, 100000],
    ] as const) {
      await call(subB, "POST", "/light-zones", { name, luxCeiling });
    }
    const speciesId = await newSpecies(subB, `Echeveria${run} elegans`, `Echeverie ${run}`);
    const e = await create(subB, { speciesId });
    const card = (await cards(subB)).body["cards"].find(
      (k: { id: string }) => k.id === e.body["id"],
    );
    expect(card).toMatchObject({ lightZone: `Hell ${run}`, lightZoneSource: "species" });
    const distribution = (await call(subB, "GET", "/specimens/distribution")).body;
    expect(distribution["distribution"]["zones"]).toMatchObject([
      { zone: { name: `Hell ${run}` }, count: 1 },
    ]);
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

// US-BES-06 · FR-BES-23 · NFR-12: the paged list and the reads over all plants, through the API (P-04 on every route).
const pageOf = (
  sub: string | null,
  params: Record<string, string> = {},
  timeZone = "Europe/Berlin",
) => call(sub, "GET", `/specimens/cards?${new URLSearchParams({ timeZone, ...params })}`);
const accountIdOf = async (sub: string): Promise<string> =>
  (await admin.query<{ id: string }>("select id from account where subject = $1", [sub])).rows[0]
    ?.id ?? "";
const named = (word: string) => `${word} ${run}`;
// A plant of its own species, so no second plant of one species needs a marker (US-BES-03).
async function plant(
  sub: string,
  word: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; speciesId: string }> {
  const speciesId = await newSpecies(sub, `Shop${run} ${word.toLowerCase()}`, named(word));
  const r = await create(sub, { speciesId, ...extra });
  return { id: r.body["id"] as string, speciesId };
}

describe("US-BES-06 · FR-BES-23 · NFR-12 paged list of 1,000 plants", () => {
  beforeAll(async () => {
    const speciesId = await newSpecies(subC, `Bulk${run} alpha`, `Bulk ${run}`);
    await cards(subC); // the first call creates the account
    await admin.query(
      `insert into specimen (account_id, species_id, name, caught_at)
       select $1, $2, 'Pflanze ' || g, date '2026-10-01' from generate_series(1, 1000) g`,
      [await accountIdOf(subC), speciesId],
    );
  });

  it("FR-BES-23 the first page is under 60 KB raw, holds 100 cards and says the total is 1,000", async () => {
    const response = await app.request("/specimens/cards?timeZone=Europe%2FBerlin", {
      headers: { authorization: `Bearer valid:${subC}` },
    });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(60_000);
    const body = JSON.parse(text) as { cards: unknown[]; total: number; next: string | null };
    expect(body.cards).toHaveLength(100);
    expect(body.total).toBe(1000);
    expect(body.next).toEqual(expect.any(String));
  });

  it("FR-BES-23 following the cursor reads every plant once: ten pages of 100, no repeats", async () => {
    const seen: string[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const r = await pageOf(subC, after ? { after } : {});
      expect(r.status).toBe(200);
      seen.push(...(r.body["cards"] as { id: string }[]).map((c) => c.id));
      after = r.body["next"] ?? undefined;
      pages++;
    } while (after);
    expect(pages).toBe(10);
    expect(new Set(seen).size).toBe(1000);
  });

  it("FR-BES-23 limit 1 and 200 are accepted; 0, 201, 1.5, abc and an empty value are input.invalid naming limit", async () => {
    expect((await pageOf(subC, { limit: "1" })).body["cards"]).toHaveLength(1);
    expect((await pageOf(subC, { limit: "200" })).body["cards"]).toHaveLength(200);
    for (const limit of ["0", "201", "1.5", "abc", ""]) {
      const r = await pageOf(subC, { limit });
      expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
      expect(r.body["error"]["details"]).toEqual([{ field: "limit", code: "input.invalid" }]);
    }
  });

  it("FR-BES-23 a malformed cursor is input.invalid naming after; the time zone is still required (NFR-08)", async () => {
    const r = await pageOf(subC, { after: "%%%" });
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect(r.body["error"]["details"]).toEqual([{ field: "after", code: "input.invalid" }]);
    expect((await pageOf(subC, {}, "")).status).toBe(400);
  });

  it("FR-BES-23 a cursor whose name holds a NUL character is input.invalid naming after, not a server error (PostgreSQL refuses NUL)", async () => {
    const after = encodeURIComponent(JSON.stringify({ name: "Pflanze\u0000", id: randomUUID() }));
    const r = await pageOf(subC, { after });
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect(r.body["error"]["details"]).toEqual([{ field: "after", code: "input.invalid" }]);
  });

  it("FR-BES-23 the summary covers all 1,000 plants, not the first page: total, unplaced, no location group, nothing measured", async () => {
    const r = await call(subC, "GET", "/specimens/cards/summary");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      total: 1000,
      groups: [],
      unplaced: 1000,
      anyMeasured: false,
      lastLocation: null,
    });
  });

  it("US-BES-06 without a token the new reads answer 401", async () => {
    for (const path of [
      "/specimens/cards/summary",
      "/specimens/treatable",
      "/specimens/cards?timeZone=Europe%2FBerlin",
    ]) {
      expect((await call(null, "GET", path)).status).toBe(401);
    }
  });
});

describe("US-BES-06 · FR-BES-23 cards, summary, treatment list and one card of a small shop", () => {
  let sued = "";
  let nord = "";
  let eins = { id: "", speciesId: "" };
  let drei = "";
  let weg = "";
  beforeAll(async () => {
    const zone = await call(subD, "POST", "/light-zones", {
      name: `Shop-Zone ${run}`,
      luxCeiling: 30000,
    });
    sued = (
      await call(subD, "POST", "/locations", {
        name: "Süd",
        kind: "indoor",
        lightZoneId: zone.body["id"],
      })
    ).body["id"] as string;
    nord = (
      await call(subD, "POST", "/locations", {
        name: "Nord",
        kind: "indoor",
        lightZoneId: zone.body["id"],
      })
    ).body["id"] as string;
    eins = await plant(subD, "Eins", { locationId: sued, catchDate: "2026-10-01" });
    await plant(subD, "Zwei", { locationId: sued, catchDate: "2026-10-02" });
    drei = (await plant(subD, "Drei", { locationId: nord, catchDate: "2026-09-30" })).id;
    await plant(subD, "Vier", { catchDate: "2026-10-03" });
    await plant(subD, "Steckling", {
      locationId: nord,
      status: "cutting",
      catchDate: "2026-09-29",
    });
    weg = (await plant(subD, "Weg", { locationId: nord, catchDate: "2026-10-05" })).id;
    await call(subD, "POST", `/specimens/${weg}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "verkauft",
    });
  });

  it("FR-BES-23 pages in name order: two cards per page, the total of the account on every page, archived ones left out", async () => {
    const first = await pageOf(subD, { limit: "2" });
    expect(first.body).toMatchObject({ total: 5 });
    expect((first.body["cards"] as { name: string }[]).map((c) => c.name)).toEqual([
      named("Drei"),
      named("Eins"),
    ]);
    const second = await pageOf(subD, { limit: "2", after: first.body["next"] });
    expect((second.body["cards"] as { name: string }[]).map((c) => c.name)).toEqual([
      named("Steckling"),
      named("Vier"),
    ]);
    const third = await pageOf(subD, { limit: "2", after: second.body["next"] });
    expect(third.body).toMatchObject({ total: 5, next: null });
    expect((third.body["cards"] as { name: string }[]).map((c) => c.name)).toEqual([named("Zwei")]);
  });

  it("FR-BES-23 location filter: a place shows its plants, `none` the plants without a place, a species its own plants", async () => {
    const atSued = await pageOf(subD, { location: sued });
    expect(atSued.body).toMatchObject({ total: 2 });
    expect((atSued.body["cards"] as { name: string }[]).map((c) => c.name)).toEqual([
      named("Eins"),
      named("Zwei"),
    ]);
    expect((await pageOf(subD, { location: nord })).body).toMatchObject({ total: 2 });
    const unplaced = await pageOf(subD, { location: "none" });
    expect(unplaced.body).toMatchObject({ total: 1 });
    expect((unplaced.body["cards"] as { name: string }[]).map((c) => c.name)).toEqual([
      named("Vier"),
    ]);
    expect((await pageOf(subD, { species: eins.speciesId })).body).toMatchObject({ total: 1 });
  });

  it("FR-BES-23 an unknown or malformed location or species is input.invalid naming its field", async () => {
    for (const [key, value] of [
      ["location", "Süd"],
      ["species", "Aloe vera"],
    ] as const) {
      const r = await pageOf(subD, { [key]: value });
      expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
      expect(r.body["error"]["details"]).toEqual([{ field: key, code: "input.invalid" }]);
    }
  });

  it("US-BES-06 summary covers all active plants: total, groups with counts, unplaced, last location; archived plants count nowhere", async () => {
    const r = await call(subD, "GET", "/specimens/cards/summary");
    expect(r.body).toEqual({
      total: 5,
      unplaced: 1,
      anyMeasured: false,
      lastLocation: "Süd",
      groups: [
        { locationId: nord, location: "Nord", count: 2 },
        { locationId: sued, location: "Süd", count: 2 },
      ],
    });
  });

  it("US-BES-06 summary: any measured plant comes from the measurements, archived ones do not count", async () => {
    expect(
      (
        await call(subD, "POST", `/specimens/${drei}/measurements`, {
          value: 10,
          timeZone: "Europe/Berlin",
        })
      ).status,
    ).toBe(201);
    expect((await call(subD, "GET", "/specimens/cards/summary")).body).toMatchObject({
      anyMeasured: true,
    });
  });

  it("US-BES-06 treatment list: every active plant with its place or null, cuttings included, archived ones left out", async () => {
    const r = await call(subD, "GET", "/specimens/treatable");
    expect(r.status).toBe(200);
    expect(
      (r.body["specimens"] as { name: string; location: string | null }[]).map((s) => [
        s.name,
        s.location,
      ]),
    ).toEqual([
      [named("Drei"), "Nord"],
      [named("Eins"), "Süd"],
      [named("Steckling"), "Nord"],
      [named("Vier"), null],
      [named("Zwei"), "Süd"],
    ]);
  });

  it("US-BES-06 one card by ID is the card of the list; archived, unknown and malformed IDs answer 404 specimen.not_found", async () => {
    const r = await call(subD, "GET", `/specimens/${eins.id}/card?timeZone=Europe%2FBerlin`);
    expect(r).toMatchObject({
      status: 200,
      body: { id: eins.id, name: named("Eins"), location: "Süd", lightZone: `Shop-Zone ${run}` },
    });
    const unknown = await call(
      subD,
      "GET",
      `/specimens/${randomUUID()}/card?timeZone=Europe%2FBerlin`,
    );
    expect(unknown).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    for (const id of [weg, "abc"]) {
      expect(
        await call(subD, "GET", `/specimens/${id}/card?timeZone=Europe%2FBerlin`),
      ).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    }
    expect((await call(subD, "GET", `/specimens/${eins.id}/card`)).status).toBe(400);
  });

  it("P-04 another account sees none of these plants: page, total, summary, treatment list and one card answer as for unknown IDs", async () => {
    const stranger = await plant(subE, "Fremd", { catchDate: "2026-10-01" });
    const unknown = await call(
      subE,
      "GET",
      `/specimens/${randomUUID()}/card?timeZone=Europe%2FBerlin`,
    );
    expect(await call(subE, "GET", `/specimens/${eins.id}/card?timeZone=Europe%2FBerlin`)).toEqual(
      unknown,
    );
    expect((await pageOf(subE, { location: sued })).body).toEqual({
      cards: [],
      total: 0,
      next: null,
    });
    const summary = await call(subE, "GET", "/specimens/cards/summary");
    expect(summary.body).toMatchObject({ total: 1, groups: [] });
    const treatable = await call(subE, "GET", "/specimens/treatable");
    expect(treatable.body).toEqual({
      specimens: [expect.objectContaining({ id: stranger.id, name: named("Fremd") })],
    });
    expect((await pageOf(subE)).body).toMatchObject({ total: 1 });
  });
});
