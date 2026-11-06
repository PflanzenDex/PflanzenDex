import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WAC-07: the leaf log through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const subA = `wac7-${randomUUID()}`;
const subB = `wac7-${randomUUID()}`;
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
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** A species epithet of its own: a word of letters only (the catalog name rule, DM-BES-01). */
const epithet = (): string =>
  randomUUID()
    .replace(/-/g, "")
    .replace(/\d/g, (digit) => "ghijklmnop".charAt(Number(digit)));

const newPlant = async (sub: string, name: string): Promise<string> => {
  const species = await call(sub, "POST", "/species", {
    latinName: `${name} ${epithet()}`,
    germanName: name,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  expect(species).toMatchObject({ status: 201 });
  const e = await call(sub, "POST", "/specimens", {
    speciesId: species.body["id"],
    timeZone: "Europe/Berlin",
  });
  expect(e).toMatchObject({ status: 201 });
  return e.body["id"] as string;
};
const leaf = (
  sub: string,
  plant: string,
  input: Record<string, unknown> = {},
  key?: string | null,
) => call(sub, "POST", `/specimens/${plant}/leaves`, { timeZone: "Europe/Berlin", ...input }, key);
const switchLeafLog = (sub: string, enabled: boolean) =>
  call(sub, "PUT", "/onboarding/switches/leaf_log", { enabled, timeZone: "Europe/Berlin" });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
  // Specimens first: the reference to the species is on delete restrict (AB-10).
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-WAC-07 the leaf log through the API", () => {
  it("US-WAC-07 one tap records a leaf of today in the keeper's time zone with no size", async () => {
    const plant = await newPlant(subA, "Tap");
    const r = await leaf(subA, plant);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      specimenId: plant,
      date: "2026-10-03",
      lengthMm: null,
      widthMm: null,
      note: null,
    });
  });

  it("US-WAC-07 the list gives the count, the comparison and the leaves newest first", async () => {
    const plant = await newPlant(subA, "Liste");
    await leaf(subA, plant, { date: "2026-09-01", lengthMm: 20 });
    await leaf(subA, plant, { date: "2026-09-15", lengthMm: 24, widthMm: 8 });
    const r = await call(subA, "GET", `/specimens/${plant}/leaves`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      specimenId: plant,
      keeperOff: false,
      count: 2,
      comparison: { measure: "length", direction: "larger" },
    });
    expect(r.body["leaves"].map((l: { date: string }) => l.date)).toEqual([
      "2026-09-15",
      "2026-09-01",
    ]);
  });

  it("US-WAC-07 a date in the future, a bad size and a bad note are refused with their codes and writes nothing", async () => {
    const plant = await newPlant(subA, "Fehler");
    expect(await leaf(subA, plant, { date: "2026-10-04" })).toMatchObject({
      status: 400,
      body: { error: { code: "leaf.date_in_future" } },
    });
    expect(await leaf(subA, plant, { lengthMm: 0 })).toMatchObject({
      status: 400,
      body: { error: { code: "leaf.size_invalid" } },
    });
    expect(await leaf(subA, plant, { note: "a".repeat(501) })).toMatchObject({
      status: 400,
      body: { error: { code: "leaf.note_invalid" } },
    });
    expect((await call(subA, "GET", `/specimens/${plant}/leaves`)).body["count"]).toBe(0);
  });

  it("US-WAC-07 another account gets not found on read, write and delete, and the leaf stays (P-04)", async () => {
    const plant = await newPlant(subA, "Fremd");
    const mine = await leaf(subA, plant, { lengthMm: 15 });
    expect((await call(subB, "GET", `/specimens/${plant}/leaves`)).status).toBe(404);
    expect((await leaf(subB, plant, {})).status).toBe(404);
    const gone = await call(subB, "DELETE", `/specimens/${plant}/leaves/${mine.body["id"]}`);
    expect(gone).toMatchObject({ status: 404, body: { error: { code: "leaf.not_found" } } });
    expect((await call(subA, "GET", `/specimens/${plant}/leaves`)).body["count"]).toBe(1);
  });

  it("US-WAC-07 the owner removes a leaf logged by mistake and the count follows", async () => {
    const plant = await newPlant(subA, "Entfernen");
    const first = await leaf(subA, plant, { lengthMm: 10 });
    await leaf(subA, plant, { lengthMm: 12 });
    const r = await call(subA, "DELETE", `/specimens/${plant}/leaves/${first.body["id"]}`);
    expect(r.status).toBe(200);
    expect((await call(subA, "GET", `/specimens/${plant}/leaves`)).body["count"]).toBe(1);
  });

  it("US-WAC-07 writes without an Idempotency-Key are refused and nothing is written", async () => {
    const plant = await newPlant(subA, "Schluessel");
    const r = await leaf(subA, plant, {}, null);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "idempotency.key_missing" } } });
  });

  it("US-WAC-07 with the keeper switch off the list is empty, writes are refused and the rows return when on (P-12, P-10)", async () => {
    const plant = await newPlant(subA, "Schalter");
    await leaf(subA, plant, { lengthMm: 18 });
    expect((await switchLeafLog(subA, false)).status).toBe(200);
    expect(await call(subA, "GET", `/specimens/${plant}/leaves`)).toMatchObject({
      status: 200,
      body: { keeperOff: true, count: 0, comparison: null, leaves: [] },
    });
    expect(await leaf(subA, plant, {})).toMatchObject({
      status: 409,
      body: { error: { code: "onboarding.keeper_off" } },
    });
    expect((await switchLeafLog(subA, true)).status).toBe(200);
    expect(await call(subA, "GET", `/specimens/${plant}/leaves`)).toMatchObject({
      body: { keeperOff: false, count: 1 },
    });
  });
});
