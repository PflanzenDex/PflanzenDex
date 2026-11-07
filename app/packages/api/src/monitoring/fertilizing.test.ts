import { randomUUID } from "node:crypto";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-MON-09: fertilizing from the pot label over HTTP (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: account ids and cleanup (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `fert-${randomUUID()}`;
const subB = `fert-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, s] = token.split(":");
  return kind === "valid"
    ? { sub: s, email: `${s}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-11-06 23:30 UTC is already 7 November in Berlin (NFR-08).
let now = new Date("2026-11-06T23:30:00Z");
let app: ReturnType<typeof createApp>;
let account = "";
let plant = "";
let fresh = "";
let archived = "";
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
const fertilize = (sub: string, specimenId: string) =>
  call(sub, "POST", "/fertilizing", { specimenId, timeZone: "Europe/Berlin" });
const lastOn = async (sub: string, specimenId: string) =>
  (await call(sub, "GET", `/specimens/${specimenId}/fertilizing`)).body["lastFertilizedOn"];
const species = async (name: string) =>
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
    })
  ).body["id"] as string;
const specimen = async (speciesId: string, marker: string) =>
  (await call(subA, "POST", "/specimens", { speciesId, marker, timeZone: "Europe/Berlin" })).body[
    "id"
  ] as string;
const at = (day: string) => {
  now = new Date(`${day}T10:00:00Z`);
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => now });
  for (const sub of [subA, subB])
    await call(sub, "PUT", "/account/profile", {
      displayName: "Dünger",
      timeZone: "Europe/Berlin",
      everythingPrivate: false,
      noRecommendations: false,
      notifications: {},
      replenishBuffer: null,
      rarityConsent: null,
      positionThresholds: null,
    });
  account = (await admin.query("select id from account where subject = $1", [subA])).rows[0].id;
  const sp = await species("Dünger");
  plant = await specimen(sp, "dünger");
  fresh = await specimen(sp, "frisch");
  archived = await specimen(sp, "archiv");
});
afterAll(async () => {
  await admin.query("delete from specimen where account_id = $1", [account]);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id = $1)`,
    [account],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await Promise.all([pool.end(), admin.end()]);
});

describe("US-MON-09 fertilizing from the pot label over HTTP", () => {
  it("US-MON-09 answers 401 without a token", async () => {
    expect((await call(null, "POST", "/fertilizing", {})).status).toBe(401);
    expect((await call(null, "GET", `/specimens/${plant}/fertilizing`)).status).toBe(401);
  });

  it("US-MON-09 a write without the Idempotency-Key is refused with 400 idempotency.key_missing", async () => {
    const res = await app.request("/fertilizing", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer valid:${subA}` },
      body: JSON.stringify({ specimenId: plant, timeZone: "Europe/Berlin" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "idempotency.key_missing" } });
  });

  it("US-MON-09 shows nothing logged yet as null, then the latest date after Gedüngt", async () => {
    expect(await lastOn(subA, fresh)).toBeNull();
    expect(await lastOn(subA, plant)).toBeNull();
    const r = await fertilize(subA, plant);
    expect(r).toMatchObject({
      status: 200,
      body: { date: "2026-11-07", specimenId: plant, created: 1 },
    });
    expect(await lastOn(subA, plant)).toBe("2026-11-07");
  });

  it("US-MON-09 a repeat on the same day writes nothing new (US-QS-03)", async () => {
    expect((await fertilize(subA, plant)).body["created"]).toBe(0);
    expect(await lastOn(subA, plant)).toBe("2026-11-07");
  });

  it("US-MON-09 a later day is logged for that day and becomes the latest date", async () => {
    at("2026-11-11");
    expect(await fertilize(subA, plant)).toMatchObject({
      status: 200,
      body: { date: "2026-11-11", created: 1 },
    });
    expect(await lastOn(subA, plant)).toBe("2026-11-11");
  });

  it("US-MON-09 an archived plant is refused with 409 specimen.archived, nothing is written, and its view still answers", async () => {
    await call(subA, "POST", `/specimens/${archived}/archive`, {
      reason: "eingegangen",
      timeZone: "UTC",
    });
    const r = await fertilize(subA, archived);
    expect(r).toMatchObject({ status: 409, body: { error: { code: "specimen.archived" } } });
    expect(await lastOn(subA, archived)).toBeNull();
  });

  it("US-MON-09 a foreign and an unknown plant get the same not-found answer, and nothing is written (P-04, P-05)", async () => {
    const unknown = randomUUID();
    const foreign = await fertilize(subB, fresh);
    const missing = await fertilize(subB, unknown);
    expect(foreign).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    expect(missing).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    // The answer names the id that was sent; code and text are the same for both (P-05).
    expect(foreign.body["error"]["text"]).toBe(missing.body["error"]["text"]);
    expect((await call(subB, "GET", `/specimens/${fresh}/fertilizing`)).status).toBe(404);
    expect((await call(subB, "GET", `/specimens/${unknown}/fertilizing`)).status).toBe(404);
    expect(await lastOn(subA, fresh)).toBeNull();
  });

  it("US-MON-09 a missing time zone is refused with 400 input.invalid, and a malformed plant id is not found", async () => {
    const r = await call(subA, "POST", "/fertilizing", { specimenId: plant });
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect((await call(subA, "GET", "/specimens/not-an-id/fertilizing")).status).toBe(404);
  });
});
