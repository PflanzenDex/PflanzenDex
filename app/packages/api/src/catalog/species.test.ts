import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openEnsuredOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-01: search, view and propose species via the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
// Letters only: an epithet contains no digits.
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `art-${randomUUID()}`;
const subB = `art-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
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

const profile = (name: string, extra: Record<string, unknown> = {}) => ({
  latinName: name,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  successCriteria: "Dichte, flache Rosette.",
  ...extra,
});

beforeAll(async () => {
  pool = await openEnsuredOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-BES-01 sign-in and input", () => {
  it.each([
    ["GET", "/species"],
    ["GET", "/species/00000000-0000-4000-8000-000000000001"],
    ["POST", "/species"],
  ])("%s %s without token: 401", async (method, path) => {
    expect((await call(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("without Idempotency-Key: 400 with a stable error code", async () => {
    const r = await call(subA, "POST", "/species", profile("Aloe vera"), null);
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
  });

  it("missing required fields: 400 with all affected fields", async () => {
    const r = await call(subA, "POST", "/species", { latinName: "Aloe vera" });
    expect(r.status).toBe(400);
    expect(r.body["error"].details.map((d: { field: string }) => d.field)).toEqual([
      "difficulty",
      "standardLevel",
      "lightDemandLux",
      "growthMeasure",
      "etiolationSigns",
      "successCriteria",
    ]);
  });
});

describe("US-BES-01 propose, search and view species", () => {
  const name = `Echeveria ${run}`;

  it("the proposal is 201, carries the status proposal and is visible only to the creator", async () => {
    const fresh = await call(
      subA,
      "POST",
      "/species",
      profile(name, { germanName: `Echeverie ${run}` }),
    );
    expect(fresh).toMatchObject({
      status: 201,
      body: { reviewStatus: "proposal", own: true, dormancyFrom: null, source: null },
    });
    const id = fresh.body["id"];
    expect((await call(subA, "GET", `/species/${id}`)).body).toMatchObject({
      latinName: name,
    });
    const foreign = await call(subB, "GET", `/species/${id}`);
    expect(foreign).toMatchObject({ status: 404, body: { error: { code: "species.not_found" } } });
    const search = (sub: string) =>
      call(sub, "GET", `/species?q=${encodeURIComponent(`echeverie ${run}`)}`);
    expect((await search(subA)).body["species"]).toHaveLength(1);
    expect((await search(subB)).body["species"]).toEqual([]);
  });

  it("duplicate: 409 with reference to the existing species; another user may create their own proposal", async () => {
    const r = await call(subA, "POST", "/species", profile(name.toUpperCase()));
    expect(r).toMatchObject({ status: 409, body: { error: { code: "species.duplicate" } } });
    expect(r.body["error"].data.existing.latinName).toBe(name);
    expect((await call(subB, "POST", "/species", profile(name))).status).toBe(201);
  });

  it("same repeat-guard key: no second entry", async () => {
    const key = randomUUID();
    const input = profile(`Haworthia ${run}`);
    const a = await call(subA, "POST", "/species", input, key);
    const b = await call(subA, "POST", "/species", input, key);
    expect(b.body["id"]).toBe(a.body["id"]);
  });

  it("invalid id: 404 instead of server error", async () => {
    expect((await call(subA, "GET", "/species/no-uuid")).status).toBe(404);
  });
});
