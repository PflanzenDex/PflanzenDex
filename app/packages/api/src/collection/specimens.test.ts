import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-02: create and view a specimen via the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes2-${randomUUID()}`;
const subB = `bes2-${randomUUID()}`;
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

const speciesProfile = (name: string, german: string) => ({
  latinName: name,
  germanName: german,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  successCriteria: "Dichte, flache Rosette.",
});
const newSpecies = async (sub: string, name: string, german: string) =>
  (await call(sub, "POST", "/species", speciesProfile(name, german))).body["id"] as string;
const create = (sub: string, input: Record<string, unknown>, key?: string) =>
  call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", ...input }, key);

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
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

describe("US-BES-02 sign-in and input", () => {
  it.each([
    ["GET", "/specimens"],
    ["GET", "/specimens/00000000-0000-4000-8000-000000000001"],
    ["POST", "/specimens"],
  ])("%s %s without token: 401", async (method, path) => {
    expect((await call(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("without Idempotency-Key: 400 with a stable error code", async () => {
    const r = await call(
      subA,
      "POST",
      "/specimens",
      { speciesId: randomUUID(), timeZone: "UTC" },
      null,
    );
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
  });

  it("without species and time zone: 400 with the affected fields, nothing written", async () => {
    const r = await call(subA, "POST", "/specimens", {});
    expect(r.status).toBe(400);
    expect(r.body["error"].code).toBe("input.invalid");
    expect(r.body["error"].details.map((d: { field: string }) => d.field)).toEqual([
      "speciesId",
      "timeZone",
    ]);
    expect((await call(subA, "GET", "/specimens")).body["specimens"]).toEqual([]);
  });

  it("an unknown species: 404 species.not_found", async () => {
    const r = await create(subA, { speciesId: randomUUID() });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "species.not_found" } } });
  });
});

describe("US-BES-02 create and view specimen", () => {
  it("species is required: 201 with name per naming rule, local caught_at and empty lists", async () => {
    const speciesId = await newSpecies(subA, `Aloe${run} vera`, `Aloe ${run}`);
    const r = await create(subA, { speciesId });
    expect(r).toMatchObject({
      status: 201,
      body: {
        speciesId,
        name: `Aloe ${run}`,
        marker: null,
        status: "plant",
        caughtAt: "2026-10-03",
        locationId: null,
        measurements: [],
        treatments: [],
      },
    });
    const loaded = await call(subA, "GET", `/specimens/${r.body["id"]}`);
    expect(loaded).toMatchObject({
      status: 200,
      body: { id: r.body["id"], name: `Aloe ${run}` },
    });
  });

  it("the same time is still the previous day in New York: caught_at follows the user's time zone (FR-BES-04)", async () => {
    const speciesId = await newSpecies(subA, `Agave${run} utah`, `Agave ${run}`);
    const r = await call(subA, "POST", "/specimens", { speciesId, timeZone: "America/New_York" });
    expect(r).toMatchObject({ status: 201, body: { caughtAt: "2026-10-02" } });
  });

  it('if the name exists, the answer is 409 and nothing changes; with a marker "Species – marker" is created', async () => {
    const speciesId = await newSpecies(subA, `Yucca${run} rostrata`, `Yucca ${run}`);
    const first = await create(subA, { speciesId });
    const duplicate = await create(subA, { speciesId });
    expect(duplicate).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.name_taken" } },
    });
    expect(duplicate.body["error"].data.existing).toEqual([
      { id: first.body["id"], name: `Yucca ${run}` },
    ]);
    const using = await create(subA, { speciesId, marker: "rot" });
    expect(using).toMatchObject({ status: 201, body: { name: `Yucca ${run} – rot` } });
    const names = (await call(subA, "GET", "/specimens")).body["specimens"].map(
      (e: { name: string }) => e.name,
    );
    expect(names.filter((n: string) => n.startsWith(`Yucca ${run}`))).toHaveLength(2);
  });

  it("an own location is accepted, that of another account rejected (404 location.not_found)", async () => {
    const speciesId = await newSpecies(subA, `Ficus${run} elastica`, `Ficus ${run}`);
    const own = await call(subA, "POST", "/locations", { name: `Regal ${run}`, kind: "indoor" });
    const foreign = await call(subB, "POST", "/locations", {
      name: `Regal ${run}`,
      kind: "indoor",
    });
    const foreignRejected = await create(subA, { speciesId, locationId: foreign.body["id"] });
    expect(foreignRejected).toMatchObject({
      status: 404,
      body: { error: { code: "location.not_found" } },
    });
    const ok = await create(subA, { speciesId, locationId: own.body["id"] });
    expect(ok).toMatchObject({ status: 201, body: { locationId: own.body["id"] } });
  });

  it("the private proposal of another account is not a selectable species (P-04)", async () => {
    const speciesId = await newSpecies(subB, `Sedum${run} morganianum`, `Sedum ${run}`);
    const r = await create(subA, { speciesId });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "species.not_found" } } });
  });

  it("an account neither sees nor loads foreign specimens: list without them, single fetch 404", async () => {
    const speciesId = await newSpecies(subB, `Opuntia${run} ficus`, `Opuntia ${run}`);
    const bens = await create(subB, { speciesId });
    const list = await call(subA, "GET", "/specimens");
    expect(list.body["specimens"].map((e: { id: string }) => e.id)).not.toContain(bens.body["id"]);
    expect(await call(subA, "GET", `/specimens/${bens.body["id"]}`)).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
  });

  it("same repeat-guard key: no second specimen, same response", async () => {
    const speciesId = await newSpecies(subA, `Sansevieria${run} cylindrica`, `Sanse ${run}`);
    const key = randomUUID();
    const a = await create(subA, { speciesId }, key);
    const b = await create(subA, { speciesId }, key);
    expect(b).toMatchObject({ status: 201, body: { id: a.body["id"] } });
  });

  it("invalid id on single fetch: 404 instead of server error", async () => {
    expect((await call(subA, "GET", "/specimens/no-uuid")).status).toBe(404);
  });
});
