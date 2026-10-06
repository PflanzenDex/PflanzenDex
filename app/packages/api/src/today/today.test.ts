import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// TE-07: the central "Today" list through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `today-${randomUUID()}`;
const subB = `today-${randomUUID()}`;
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
): Promise<Response> {
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
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const species: Record<string, string> = {};
const items = async (sub: string) =>
  (await call(sub, "GET", "/today?timeZone=Europe/Berlin")).body["items"] as {
    kind: string;
    specimenId: string;
    nextAction: string;
    target: string;
  }[];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
  for (const sub of [subA, subB]) {
    const s = await call(sub, "POST", "/species", {
      latinName: `Heute${run}${sub === subA ? "a" : "b"} test`,
      germanName: `Heute ${run} ${sub === subA ? "a" : "b"}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    });
    species[sub] = s.body["id"] as string;
  }
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

describe("TE-07 GET /today", () => {
  it("TE-07 without token: 401", async () => {
    expect((await call(null, "GET", "/today?timeZone=Europe/Berlin")).status).toBe(401);
  });

  it("TE-07 an unknown time zone: 400 input.invalid", async () => {
    const r = await call(subA, "GET", "/today?timeZone=Mars/Olympus");
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
  });

  it("TE-07 an account without specimens gets an empty list with today's local date", async () => {
    const r = await call(subB, "GET", "/today?timeZone=Europe/Berlin");
    expect(r).toMatchObject({ status: 200, body: { date: "2026-10-03", items: [], upcoming: 0 } });
  });

  it("TE-07 US-BEH-02 US-BES-08 lists an overdue treatment and an incomplete specimen, each with its action", async () => {
    const created = await call(subA, "POST", "/specimens", {
      speciesId: species[subA],
      marker: "heute",
      timeZone: "Europe/Berlin",
    });
    const id = created.body["id"] as string;
    await call(subA, "POST", "/treatments", {
      specimenIds: [id],
      reason: "Wollläuse",
      date: "2026-10-01",
    });
    const own = await items(subA);
    expect(own.map((i) => i.kind)).toEqual(["treatment_overdue", "specimen_incomplete"]);
    expect(own.every((i) => i.specimenId === id && i.nextAction.length > 0)).toBe(true);
    expect(own.map((i) => i.target)).toEqual(["treatments", "hints"]);
  });

  it("TE-07 P-04 another account sees nothing of it", async () => {
    expect(await items(subB)).toEqual([]);
  });
});
