import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-PHA-01: care phases through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `pha1-${randomUUID()}`;
const subB = `pha1-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-31 23:30 UTC: already 1 November in Berlin, still 31 October in UTC.
const NOW = new Date("2026-10-31T23:30:00Z");
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> } as Response; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const species = (name: string, dormancy: Record<string, string> = {}) => ({
  latinName: name,
  germanName: name,
  difficulty: 2,
  standardLevel: 3,
  lightDemandLux: 40000,
  growthMeasure: "rosette_diameter",
  etiolationSigns: "Rosette streckt sich.",
  successCriteria: "Dichte, flache Rosette.",
  ...dormancy,
});
const newSpecies = async (sub: string, name: string, dormancy?: Record<string, string>) =>
  (await call(sub, "POST", "/species", species(name, dormancy))).body["id"] as string;
const specimen = (sub: string, speciesId: string) =>
  call(sub, "POST", "/specimens", { speciesId, timeZone: "Europe/Berlin" });

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

describe("US-PHA-01 care phases through the API", () => {
  it("US-PHA-01 without token: 401", async () => {
    expect((await call(null, "GET", "/care-phases?timeZone=UTC")).status).toBe(401);
  });

  it("US-PHA-01 without valid time zone: 400 with field timeZone", async () => {
    for (const path of ["/care-phases", "/care-phases?timeZone=Nirgendwo"]) {
      const r = await call(subA, "GET", path);
      expect(r.status).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
      expect(r.body["error"].details).toEqual([{ field: "timeZone", code: "input.invalid" }]);
    }
  });

  it("US-PHA-01 lists only specimens with a dormancy period and derives the phase from the local date", async () => {
    const using = await newSpecies(subA, `Winter${run}`, {
      dormancyFrom: "11-01",
      dormancyUntil: "03-15",
    });
    const without = await newSpecies(subA, `Immer${run}`);
    await specimen(subA, using);
    await specimen(subA, without);

    const berlin = await call(subA, "GET", "/care-phases?timeZone=Europe%2FBerlin");
    expect(berlin.status).toBe(200);
    expect(berlin.body["phases"]).toHaveLength(1);
    expect(berlin.body["phases"][0]).toMatchObject({
      name: `Winter${run}`,
      speciesId: using,
      phase: "dormancy",
      locationId: null,
      targetLocationId: null,
    });
    const utc = await call(subA, "GET", "/care-phases?timeZone=UTC");
    expect(utc.body["phases"][0].phase).toBe("growth");
  });

  it("US-PHA-01 without a set clock the system time applies", async () => {
    const real = createApp({ reviewer, pool });
    const res = await real.request("/care-phases?timeZone=UTC", {
      headers: { authorization: `Bearer valid:${subB}` },
    });
    expect(res.status).toBe(200);
  });

  it("US-PHA-01 another account does not see the specimens (P-04)", async () => {
    const r = await call(subB, "GET", "/care-phases?timeZone=UTC");
    expect(r).toMatchObject({ status: 200, body: { phases: [] } });
  });
});
