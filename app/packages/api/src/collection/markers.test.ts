import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-03: tell several specimens of a species apart via the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `bes3-${randomUUID()}`;
const subB = `bes3-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
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
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const newSpecies = async (sub: string, latin: string, german: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: latin,
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
const mark = (sub: string, id: string, marker: unknown) =>
  call(sub, "POST", `/specimens/${id}/marker`, { marker });
const list = async (sub: string): Promise<{ id: string; name: string; marker: string | null }[]> =>
  (await call(sub, "GET", "/specimens")).body["specimens"];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
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

describe("US-BES-03 naming rule via the API", () => {
  it("1st plain, 2nd needs a marker (409 marker_required), 3rd asks for the missing marker before saving", async () => {
    const speciesId = await newSpecies(subA, `Sansevieria${run} alpha`, `Zimmerhanf ${run}`);
    const first = await create(subA, { speciesId });
    expect(first).toMatchObject({ status: 201, body: { name: `Zimmerhanf ${run}`, marker: null } });

    const noMarker = await create(subA, { speciesId });
    expect(noMarker).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.marker_required" } },
    });

    const second = await create(subA, { speciesId, marker: "Klammer" });
    expect(second).toMatchObject({ status: 201, body: { name: `Zimmerhanf ${run} – Klammer` } });

    const before = await list(subA);
    const third = await create(subA, { speciesId, marker: "rot" });
    expect(third).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.markers_missing" } },
    });
    expect(third.body["error"].data.missing).toEqual([
      { id: first.body["id"], name: `Zimmerhanf ${run}` },
    ]);
    expect(await list(subA)).toEqual(before);

    const saved = await create(subA, {
      speciesId,
      marker: "rot",
      markers: [{ specimenId: first.body["id"], marker: "blau" }],
    });
    expect(saved).toMatchObject({ status: 201, body: { name: `Zimmerhanf ${run} – rot` } });
    const names = (await list(subA)).map((e) => e.name).filter((n) => n.includes(run));
    expect(names.sort()).toEqual(
      [`Zimmerhanf ${run} – Klammer`, `Zimmerhanf ${run} – blau`, `Zimmerhanf ${run} – rot`].sort(),
    );
  });

  it("a duplicate marker (case-insensitive) is 409 marker_taken, nothing changes", async () => {
    const speciesId = await newSpecies(subA, `Aloe${run} beta`, `Aloe ${run}`);
    await create(subA, { speciesId, marker: "rot" });
    const before = await list(subA);
    const dup = await create(subA, { speciesId, marker: "ROT" });
    expect(dup).toMatchObject({ status: 409, body: { error: { code: "specimen.marker_taken" } } });
    expect(await list(subA)).toEqual(before);
  });
});

describe("US-BES-03 rename via the API", () => {
  it("gives a marker; the id stays and a read by the old id shows the new name", async () => {
    const speciesId = await newSpecies(subA, `Ficus${run} gamma`, `Ficus ${run}`);
    const z = await create(subA, { speciesId });
    const id = z.body["id"] as string;
    const r = await mark(subA, id, "  rot ");
    expect(r).toMatchObject({
      status: 200,
      body: { id, name: `Ficus ${run} – rot`, marker: "rot", caughtAt: "2026-10-03" },
    });
    expect((await call(subA, "GET", `/specimens/${id}`)).body).toMatchObject({
      name: `Ficus ${run} – rot`,
    });
  });

  it("empty or duplicate marker: error, nothing changed", async () => {
    const speciesId = await newSpecies(subA, `Yucca${run} delta`, `Yucca ${run}`);
    const z = await create(subA, { speciesId });
    await create(subA, { speciesId, marker: "rot" });
    const id = z.body["id"] as string;
    expect(await mark(subA, id, "  ")).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid" } },
    });
    expect(await mark(subA, id, "ROT")).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.marker_taken" } },
    });
    expect((await call(subA, "GET", `/specimens/${id}`)).body).toMatchObject({
      name: `Yucca ${run}`,
      marker: null,
    });
  });

  it("an archived specimen is not renamed (409 specimen.archived)", async () => {
    const speciesId = await newSpecies(subA, `Agave${run} epsilon`, `Agave ${run}`);
    const id = (await create(subA, { speciesId })).body["id"] as string;
    await call(subA, "POST", `/specimens/${id}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "abgegeben",
    });
    expect(await mark(subA, id, "rot")).toMatchObject({
      status: 409,
      body: { error: { code: "specimen.archived" } },
    });
  });

  it("two accounts: the other account's specimen looks unknown (404) and stays unchanged (P-04)", async () => {
    const speciesId = await newSpecies(subB, `Hoya${run} zeta`, `Hoya ${run}`);
    const id = (await create(subB, { speciesId })).body["id"] as string;
    expect(await mark(subA, id, "rot")).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    expect((await call(subB, "GET", `/specimens/${id}`)).body).toMatchObject({
      name: `Hoya ${run}`,
      marker: null,
    });
    // Each account has its own specimens: the same marker at the own specimen of another species is fine.
    const own = await newSpecies(subA, `Hoya${run} eta`, `Hoya ${run}`);
    const mine = (await create(subA, { speciesId: own })).body["id"] as string;
    expect(await mark(subA, mine, "rot")).toMatchObject({ status: 200 });
  });

  it("an answer for a foreign specimen when creating the third one is 404 and changes nothing", async () => {
    const speciesId = await newSpecies(subA, `Peperomia${run} eta`, `Peperomia ${run}`);
    await create(subA, { speciesId });
    await create(subA, { speciesId, marker: "a" });
    const theirs = await newSpecies(subB, `Peperomia${run} theta`, `Pep ${run}`);
    const foreign = (await create(subB, { speciesId: theirs })).body["id"] as string;
    const r = await create(subA, {
      speciesId,
      marker: "b",
      markers: [{ specimenId: foreign, marker: "x" }],
    });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    expect((await call(subB, "GET", `/specimens/${foreign}`)).body).toMatchObject({
      marker: null,
    });
  });

  it.each([["POST", "/specimens/00000000-0000-4000-8000-000000000001/marker"]])(
    "%s %s without token: 401; without Idempotency-Key: 400",
    async (method, path) => {
      expect((await call(null, method, path, { marker: "x" })).status).toBe(401);
      expect((await call(subA, method, path, { marker: "x" }, null)).status).toBe(400);
    },
  );
});
