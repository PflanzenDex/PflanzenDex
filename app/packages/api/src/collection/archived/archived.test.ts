import { randomUUID } from "node:crypto";
import type { TreatmentSource, MeasurementSource } from "@pflanzendex/core";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-07: archive and restore specimens through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const subA = `bes7-${randomUUID()}`;
const subB = `bes7-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: already 3 October in Berlin, still 2 October in New York (NFR-08)
const NOW = new Date("2026-10-02T23:30:00Z");
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

// The ports of WAC and BEH remember which specimens they were asked about.
const asked: string[] = [];
const measurements: MeasurementSource = {
  forSpecimens: async (_n, ids) => (asked.push(...ids), new Map()),
};
const treatments: TreatmentSource = {
  open: async (_n, ids) => (asked.push(...ids), new Map()),
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
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
// Latin names consist of letters only: each species gets its own sequence of letters.
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
let speciesCounter = 0;
const unique = (word: string) => {
  speciesCounter += 1;
  const number = [...String(speciesCounter)].map((z) => "abcdefghij"[Number(z)]).join("");
  return `${word}${run}${number}`;
};
const newSpecies = async (sub: string, word: string) => {
  const name = unique(word);
  return createSpecies(sub, `${name} vera`, name);
};
const createSpecies = async (sub: string, name: string, german: string) =>
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
const createOne = async (sub: string, species: string, marker?: string) =>
  (
    await call(sub, "POST", "/specimens", {
      speciesId: species,
      timeZone: "Europe/Berlin",
      ...(marker ? { marker } : {}),
    })
  ).body["id"] as string;
const archive = (sub: string | null, id: string, extra: Record<string, unknown> = {}) =>
  call(sub, "POST", `/specimens/${id}/archive`, {
    timeZone: "Europe/Berlin",
    reason: "eingegangen",
    ...extra,
  });
const restoreSpecimen = (sub: string | null, id: string) =>
  call(sub, "POST", `/specimens/${id}/restore`, {});
const ids = (a: Response, field: string) => (a.body[field] as { id: string }[]).map((x) => x.id);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW, measurements, treatments });
});
afterAll(async () => {
  // Specimens first: the reference to the species is on delete restrict (AB-10).
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

describe("US-BES-07 sign-in and input", () => {
  const E = "00000000-0000-4000-8000-000000000001";
  it.each([
    ["POST", `/specimens/${E}/archive`],
    ["POST", `/specimens/${E}/restore`],
    ["GET", "/specimens/archived"],
  ])("%s %s without token: 401", async (method, path) => {
    expect((await call(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("without Idempotency-Key: 400 with a stable error code", async () => {
    const r = await call(
      subA,
      "POST",
      `/specimens/${E}/archive`,
      { timeZone: "Europe/Berlin", reason: "eingegangen" },
      null,
    );
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
  });

  it("without reason: 400 with detail on the field, nothing is archived", async () => {
    const species = await newSpecies(subA, "Eingabe");
    const id = await createOne(subA, species);
    const r = await archive(subA, id, { reason: "  " });
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid", details: [{ field: "reason" }] } },
    });
    expect((await call(subA, "GET", `/specimens/${id}`)).body["status"]).toBe("plant");
  });
});

describe("US-BES-07 archive, list and restore", () => {
  it("sets status, local date and reason; lists and cards hide the specimen", async () => {
    const species = await newSpecies(subA, "Liste");
    const away = await createOne(subA, species, "away");
    const da = await createOne(subA, species, "da");
    asked.length = 0;
    const r = await archive(subA, away, { reason: "verschenkt" });
    expect(r).toMatchObject({
      status: 200,
      body: {
        id: away,
        status: "archived",
        archivedAt: "2026-10-03",
        archivedReason: "verschenkt",
      },
    });
    const list = await call(subA, "GET", "/specimens");
    expect(ids(list, "specimens")).toEqual(expect.arrayContaining([da]));
    expect(ids(list, "specimens")).not.toContain(away);
    const cards = await call(subA, "GET", "/specimens/cards?timeZone=Europe%2FBerlin");
    expect(ids(cards, "cards")).not.toContain(away);
    expect(asked).not.toContain(away);
    expect(asked).toContain(da);
  });

  it("the archived specimen stays loadable and is in the archive (with species, date, reason)", async () => {
    const species = await newSpecies(subA, "Archiv");
    const id = await createOne(subA, species);
    await archive(subA, id, { reason: "abgegeben", timeZone: "America/New_York" });
    expect(await call(subA, "GET", `/specimens/${id}`)).toMatchObject({
      status: 200,
      body: { status: "archived", archivedReason: "abgegeben", archivedAt: "2026-10-02" },
    });
    const archived = await call(subA, "GET", "/specimens/archived");
    expect(archived.status).toBe(200);
    expect(archived.body["archived"]).toContainEqual(
      expect.objectContaining({ id, archivedReason: "abgegeben", archivedAt: "2026-10-02" }),
    );
  });

  it("restoring brings the specimen back into list and cards and deletes date and reason", async () => {
    const species = await newSpecies(subA, "Zurück");
    const id = await createOne(subA, species);
    await archive(subA, id);
    expect(await restoreSpecimen(subA, id)).toMatchObject({
      status: 200,
      body: { status: "plant", archivedAt: null, archivedReason: null },
    });
    expect(ids(await call(subA, "GET", "/specimens"), "specimens")).toContain(id);
    expect(ids(await call(subA, "GET", "/specimens/archived"), "archived")).not.toContain(id);
  });

  it("archiving twice and restoring without archive: 409 with error code", async () => {
    const species = await newSpecies(subA, "Zweimal");
    const id = await createOne(subA, species);
    expect((await restoreSpecimen(subA, id)).body).toMatchObject({
      error: { code: "specimen.not_archived" },
    });
    await archive(subA, id, { reason: "eingegangen" });
    const second = await archive(subA, id, { reason: "verkauft" });
    expect(second).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.already_archived" } },
    });
    expect((await call(subA, "GET", `/specimens/${id}`)).body["archivedReason"]).toBe(
      "eingegangen",
    );
  });

  it("an archived name stays taken (409), so restoring never collides", async () => {
    const species = await newSpecies(subA, "Name");
    const id = await createOne(subA, species);
    await archive(subA, id);
    const again = await call(subA, "POST", "/specimens", {
      speciesId: species,
      timeZone: "Europe/Berlin",
    });
    expect(again).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.name_taken" } },
    });
  });

  it("an archived specimen cannot be measured (409), its measurement series stays readable", async () => {
    const species = await newSpecies(subA, "Messen");
    const id = await createOne(subA, species);
    const measure = () =>
      call(subA, "POST", `/specimens/${id}/measurements`, { timeZone: "Europe/Berlin", value: 12 });
    expect((await measure()).status).toBe(201);
    await archive(subA, id);
    expect(await measure()).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.archived" } },
    });
    const m = await call(subA, "GET", `/specimens/${id}/measurements`);
    expect(m.status).toBe(200);
    expect(m.body["measurements"]).toHaveLength(1);
  });
});

describe("US-BES-07 Mandantentrennung (P-04)", () => {
  it("a foreign specimen can neither be archived nor restored (404 like unknown)", async () => {
    const species = await newSpecies(subA, "Fremd");
    const annas = await createOne(subA, species);
    const foreign = await archive(subB, annas);
    const unknown = await archive(subB, "99999999-9999-4999-8999-999999999999");
    expect(foreign).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    expect(foreign.body).toEqual(unknown.body);
    expect((await call(subA, "GET", `/specimens/${annas}`)).body["status"]).toBe("plant");
    await archive(subA, annas);
    expect((await restoreSpecimen(subB, annas)).status).toBe(404);
    expect((await call(subA, "GET", `/specimens/${annas}`)).body["status"]).toBe("archived");
  });

  it("the archive of an account contains nothing of another", async () => {
    const species = await newSpecies(subB, "Archivb");
    const bens = await createOne(subB, species);
    await archive(subB, bens);
    const annas = await call(subA, "GET", "/specimens/archived");
    expect(ids(annas, "archived")).not.toContain(bens);
    expect(ids(await call(subB, "GET", "/specimens/archived"), "archived")).toContain(bens);
  });
});
