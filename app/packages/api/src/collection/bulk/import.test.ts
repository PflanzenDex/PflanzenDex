import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Response = { status: number; body: Record<string, any> };

// US-BES-18 (FR-BES-26): the CSV import through the API, with a real database (`make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
let app: ReturnType<typeof createApp>;
const subA = `bes18-${randomUUID()}`;
const subB = `bes18-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-11-07 10:00 UTC: already the 7th in Berlin (NFR-08).
const NOW = new Date("2026-11-07T10:00:00Z");
const HEADER = "Art,Spitzname,Standort,Kaufdatum,Notizen";
// Letters only: a Latin name takes letters and hyphens per word (DM-BES-01), so no digit from a UUID.
const run = randomUUID()
  .replace(/-/g, "")
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .slice(0, 10);

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
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Response["body"] };
}

const profile = (latin: string, german: string) => ({
  latinName: latin,
  germanName: german,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  successCriteria: "Dichte, flache Rosette.",
});
const speciesOf = async (sub: string, latin: string, german: string) =>
  (await call(sub, "POST", "/species", profile(latin, german))).body["id"] as string;
const preview = (sub: string | null, csv: string, extra: Record<string, unknown> = {}) =>
  call(
    sub,
    "POST",
    "/specimens/import/preview",
    { csv, timeZone: "Europe/Berlin", ...extra },
    null,
  );
const confirm = (
  sub: string | null,
  rows: unknown[],
  extra: Record<string, unknown> = {},
  key?: string | null,
) =>
  call(
    sub,
    "POST",
    "/specimens/import",
    { timeZone: "Europe/Berlin", rows, ...extra },
    key === undefined ? randomUUID() : key,
  );
const row = (line: number, over: Record<string, unknown> = {}) => ({
  line,
  speciesId: null,
  marker: null,
  locationId: null,
  newLocation: null,
  catchDate: null,
  notes: null,
  ...over,
});
const switchOff = (sub: string, enabled: boolean) =>
  call(sub, "PUT", "/onboarding/switches/csv_import", { enabled, timeZone: "Europe/Berlin" });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
  const accounts = [subA, subB];
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [accounts],
  );
  await admin.query(
    "delete from location where account_id in (select id from account where subject = any($1))",
    [accounts],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [accounts],
  );
  await admin.query("delete from account where subject = any($1)", [accounts]);
  await pool.end();
  await admin.end();
});

describe("US-BES-18 sign-in and the keeper switch (P-12)", () => {
  it("US-BES-18 both routes need a signed-in keeper: 401 without a token", async () => {
    expect((await preview(null, HEADER)).status).toBe(401);
    expect((await confirm(null, [])).status).toBe(401);
  });

  it("US-BES-18 with the switch off both routes refuse as onboarding.keeper_off, and the rows come back when it is on", async () => {
    expect((await switchOff(subA, false)).status).toBe(200);
    expect(await preview(subA, HEADER)).toMatchObject({
      status: 409,
      body: { error: { code: "onboarding.keeper_off" } },
    });
    expect(await confirm(subA, [])).toMatchObject({
      status: 409,
      body: { error: { code: "onboarding.keeper_off" } },
    });
    expect((await switchOff(subA, true)).status).toBe(200);
    expect((await preview(subA, HEADER)).status).toBe(200);
  });
});

describe("US-BES-18 the preview writes nothing and says why a row is flagged", () => {
  it("US-BES-18 every row gets its state; no specimen and no location is written", async () => {
    const name = `Ficus${run} lyrata`;
    const id = await speciesOf(subA, name, `Geigenfeige ${run}`);
    const r = await preview(
      subA,
      [HEADER, `${name},Pit,Balkon,2026-03-01,ok`, `Kaktus ${run},,,,`].join("\n"),
    );
    expect(r.status).toBe(200);
    expect(r.body["rows"].map((x: { state: string }) => x.state)).toEqual(["ready", "flagged"]);
    expect(r.body["rows"][0]).toMatchObject({
      line: 2,
      species: { id },
      specimenName: `Geigenfeige ${run} – Pit`,
      location: { name: "Balkon", isNew: true },
      catchDate: "2026-03-01",
    });
    expect(r.body["rows"][1]["reasons"]).toEqual([
      { code: "import.species_not_found", field: "species" },
    ]);
    expect(r.body["newLocations"]).toEqual(["Balkon"]);
    expect((await call(subA, "GET", "/specimens")).body["specimens"]).toEqual([]);
    expect((await call(subA, "GET", "/locations")).body["locations"]).toEqual([]);
  });

  it("US-BES-18 a partial name is a candidate and never ready; another keeper's species is no match (P-04)", async () => {
    const own = await speciesOf(subA, `Hoya${run} kerrii`, `Herzblatt ${run}`);
    const partial = await preview(subA, [HEADER, `Hoya${run}`].join("\n"));
    expect(partial.body["rows"][0]).toMatchObject({
      state: "flagged",
      species: { id: null, candidates: [{ id: own }] },
    });
    const foreign = await preview(subB, [HEADER, `Hoya${run} kerrii`].join("\n"));
    expect(foreign.body["rows"][0]).toMatchObject({
      state: "flagged",
      species: { id: null, candidates: [] },
    });
    expect(foreign.body["rows"][0]["reasons"]).toEqual([
      { code: "import.species_not_found", field: "species" },
    ]);
  });

  it("US-BES-18 an exact synonym makes the row ready through the catalog lookup, ignoring case and accents", async () => {
    const created = await call(subA, "POST", "/species", {
      ...profile(`Clusia${run} rosea`, `Gummibaum ${run}`),
      synonyms: [`Klusie${run}`],
    });
    expect(created.status).toBe(201);
    const r = await preview(subA, [HEADER, `KLUSÍE${run},,,,`].join("\n"));
    expect(r.body["rows"][0]).toMatchObject({
      state: "ready",
      species: { id: created.body["id"], name: `KLUSÍE${run}` },
    });
  });

  it("US-BES-18 a file without a species column or with a broken row is refused as a whole", async () => {
    expect(await preview(subA, "Spitzname\nLulu")).toMatchObject({
      status: 400,
      body: { error: { code: "import.no_species_column" } },
    });
    expect(await preview(subA, "Art\nAloe,zu viel")).toMatchObject({
      status: 400,
      body: { error: { code: "import.file_unreadable" } },
    });
  });
});

describe("US-BES-18 the confirmation writes the confirmed rows", () => {
  it("US-BES-18 without the Idempotency-Key the import is refused and nothing is written", async () => {
    expect(await confirm(subA, [row(2)], {}, null)).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
  });

  it("US-BES-18 rows are created with marker, location, date and notes; a new location is created once, without a light zone", async () => {
    const lulu = await speciesOf(subA, `Monstera ${run}`, `Fensterblatt ${run}`);
    const other = await speciesOf(subA, `Aloe ${run}`, `Aloe ${run}`);
    const r = await confirm(subA, [
      row(2, {
        speciesId: lulu,
        marker: "Lulu",
        newLocation: "Balkon",
        catchDate: "2026-03-01",
        notes: "vom Markt",
      }),
      row(3, { speciesId: other, newLocation: "balkon" }),
    ]);
    expect(r).toMatchObject({
      status: 200,
      body: {
        created: [{ line: 2 }, { line: 3 }],
        skipped: [],
        refused: [],
        locationsCreated: ["Balkon"],
      },
    });
    const first = await call(subA, "GET", `/specimens/${r.body["created"][0]["id"]}`);
    expect(first.body).toMatchObject({
      name: `Fensterblatt ${run} – Lulu`,
      marker: "Lulu",
      caughtAt: "2026-03-01",
      notes: "vom Markt",
    });
    expect(first.body["locationId"]).toBeTruthy();
    const locations = (await call(subA, "GET", "/locations")).body["locations"] as {
      name: string;
      lightZoneId: unknown;
      kind: string;
    }[];
    expect(locations.filter((l) => l.name === "Balkon")).toEqual([
      expect.objectContaining({ kind: "indoor", lightZoneId: null }),
    ]);
  });

  it("US-BES-18 a repeat of the import creates nothing twice and reports the rows as skipped", async () => {
    const id = await speciesOf(subA, `Haworthia ${run}`, `Haworthie ${run}`);
    const rows = [row(2, { speciesId: id, marker: "Gruen" })];
    expect((await confirm(subA, rows)).body).toMatchObject({ created: [{ line: 2 }] });
    const again = await confirm(subA, rows);
    expect(again).toMatchObject({
      status: 200,
      body: { created: [], skipped: [{ line: 2 }], refused: [] },
    });
    const preview2 = await preview(subA, [HEADER, `Haworthia ${run},Gruen,,,`].join("\n"));
    expect(preview2.body["rows"][0]["state"]).toBe("already_there");
  });

  it("US-BES-18 a row refused at that moment does not stop the others, and the result names it", async () => {
    const id = await speciesOf(subA, `Pilea ${run}`, `Ufopflanze ${run}`);
    const foreignLocation = (
      await call(subB, "POST", "/locations", { name: `Garten ${run}`, kind: "outdoor" })
    ).body["id"] as string;
    const r = await confirm(subA, [
      row(2, { speciesId: id, locationId: foreignLocation }),
      row(3, { speciesId: id, marker: "Rund" }),
    ]);
    expect(r).toMatchObject({
      status: 200,
      body: { created: [{ line: 3 }], refused: [{ line: 2, code: "location.not_found" }] },
    });
  });

  it("US-BES-18 another keeper's species is refused as unknown (P-04)", async () => {
    const privateSpecies = await speciesOf(subB, `Hoya${run} privat`, `Privat ${run}`);
    const r = await confirm(subA, [row(2, { speciesId: privateSpecies })]);
    expect(r).toMatchObject({
      status: 200,
      body: { created: [], refused: [{ line: 2, code: "species.not_found" }] },
    });
  });

  it("US-BES-18 the marker answer reaches the row that makes the third plant; without it that row is refused", async () => {
    const id = await speciesOf(subA, `Dracaena ${run}`, `Bogenhanf ${run}`);
    const plant = await call(subA, "POST", "/specimens", {
      speciesId: id,
      timeZone: "Europe/Berlin",
    });
    expect(plant.status).toBe(201);
    const rows = [row(2, { speciesId: id, marker: "a" }), row(3, { speciesId: id, marker: "b" })];
    expect(await confirm(subA, rows)).toMatchObject({
      status: 200,
      body: { created: [{ line: 2 }], refused: [{ line: 3, code: "specimen.markers_missing" }] },
    });
    const answered = await confirm(
      subA,
      rows.map((x) => ({ ...x, marker: x.marker === "b" ? "c" : x.marker })),
      {
        markers: [{ specimenId: plant.body["id"], marker: "d" }],
      },
    );
    // Row 2 was written by the first call: it is there already and skipped; row 3 gets the answer and is written.
    expect(answered.body).toMatchObject({
      created: [{ line: 3 }],
      skipped: [{ line: 2 }],
      refused: [],
      unusedMarkers: [],
    });
    expect((await call(subA, "GET", `/specimens/${plant.body["id"]}`)).body["name"]).toBe(
      `Bogenhanf ${run} – d`,
    );
  });
});

describe("US-BES-18 the keeper's fixes in the preview (overrides)", () => {
  it("US-BES-18 a chosen candidate makes a partial name ready; a foreign or an unknown species stays flagged (P-04)", async () => {
    const own = await speciesOf(subA, `Yucca${run} filifera`, `Palmlilie ${run}`);
    const csv = [HEADER, `Yucca${run}`].join("\n");
    expect((await preview(subA, csv)).body["rows"][0]).toMatchObject({
      state: "flagged",
      species: { candidates: [{ id: own }] },
    });
    const chosen = await preview(subA, csv, { overrides: [{ line: 2, speciesId: own }] });
    expect(chosen.body["rows"][0]).toMatchObject({ state: "ready", species: { id: own } });
    const foreign = await speciesOf(subB, `Yucca${run} privat`, `Privat ${run}`);
    for (const speciesId of [foreign, randomUUID()]) {
      const r = await preview(subA, csv, { overrides: [{ line: 2, speciesId }] });
      expect(r.body["rows"][0]).toMatchObject({ state: "flagged", species: { id: null } });
      expect(r.body["rows"][0]["reasons"]).toEqual([
        { code: "import.species_not_found", field: "species" },
      ]);
    }
  });

  it("US-BES-18 a marker fix clears marker_required; a skipped row counts toward no plant and is shown as skipped", async () => {
    const latin = `Zamia${run} furfuracea`;
    await speciesOf(subA, latin, `Zamie ${run}`);
    const csv = [HEADER, `${latin},Rot,,,`, `${latin},Blau,,,`, `${latin},,,,`].join("\n");
    const before = await preview(subA, csv);
    expect(before.body["rows"].map((x: { state: string }) => x.state)).toEqual([
      "ready",
      "ready",
      "flagged",
    ]);
    expect(before.body["rows"][2]["reasons"]).toEqual([
      { code: "specimen.marker_required", field: "nickname" },
    ]);
    const fixed = await preview(subA, csv, { overrides: [{ line: 4, marker: "Gruen" }] });
    expect(fixed.body["rows"][2]).toMatchObject({ state: "ready", marker: "Gruen" });
    const skipped = await preview(subA, csv, { overrides: [{ line: 4, skip: true }] });
    expect(skipped.body["rows"].map((x: { state: string }) => x.state)).toEqual([
      "ready",
      "ready",
      "skipped",
    ]);
    expect(skipped.body["counts"]).toEqual({ ready: 2, flagged: 0, alreadyThere: 0, skipped: 1 });
  });

  it("US-BES-18 an override for a line that is not in the file is refused as input.invalid", async () => {
    expect(
      await preview(subA, [HEADER, "Aloe,,,,"].join("\n"), {
        overrides: [{ line: 7, skip: true }],
      }),
    ).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
  });
});

describe("US-BES-18 limits of the request (FR-BES-26)", () => {
  it("US-BES-18 a file of 1 MB goes through; a file above the body limit answers import.too_large (413)", async () => {
    const big = [
      HEADER,
      ...Array.from({ length: 500 }, () => `Ficus lyrata,,,,${"x".repeat(2000)}`),
    ].join("\n");
    expect(new TextEncoder().encode(big).length).toBeLessThan(1024 * 1024);
    const ok = await preview(subA, big);
    expect(ok.status).toBe(200);
    expect(ok.body["rows"]).toHaveLength(500);
    const tooBig = await preview(subA, `Art\n${"a".repeat(3 * 1024 * 1024)}`);
    expect(tooBig).toMatchObject({ status: 413, body: { error: { code: "import.too_large" } } });
  });

  it("US-BES-18 more than 500 rows answer import.too_large (413)", async () => {
    const many = [HEADER, ...Array.from({ length: 501 }, (_, i) => `Pflanze ${i}`)].join("\n");
    expect(await preview(subA, many)).toMatchObject({
      status: 413,
      body: { error: { code: "import.too_large" } },
    });
  });
});
