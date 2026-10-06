import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-05: species compared by difficulty through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const subjects: string[] = [];
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const difficulty = (sub: string | null) => call(sub, "GET", "/specimens/difficulty");

const newSpecies = async (sub: string, name: string, level: number, extra = {}) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: level,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      ...extra,
    })
  ).body["id"] as string;

const specimen = async (sub: string, marker: string, speciesId: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker,
    })
  ).body["id"] as string;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});

afterAll(async () => {
  if (subjects.length > 0) {
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
  }
  await pool.end();
  await admin.end();
});

describe("US-BES-05: difficulty overview", () => {
  it("requires authentication", async () => {
    expect((await difficulty(null)).status).toBe(401);
  });

  it("is empty for an account without specimens", async () => {
    const sub = `bes5-${randomUUID()}`;
    subjects.push(sub);
    const r = await difficulty(sub);
    expect(r.status).toBe(200);
    expect(r.body["rows"]).toEqual([]);
  });

  it("lists species with an active specimen sorted by difficulty, with the care columns", async () => {
    const sub = `bes5-${randomUUID()}`;
    subjects.push(sub);
    const hard = await newSpecies(sub, "Hardplant", 3);
    const easy = await newSpecies(sub, "Easyplant", 1, {
      wateringHint: "alle 10 Tage",
      substrate: "Humus",
      pruning: "selten",
    });
    await newSpecies(sub, "Noplant", 2);
    await specimen(sub, "A", hard);
    await specimen(sub, "B", easy);
    const r = await difficulty(sub);
    expect(r.status).toBe(200);
    expect(r.body["rows"].map((x: { botanicalName: string }) => x.botanicalName)).toEqual([
      "Easyplant",
      "Hardplant",
    ]);
    expect(r.body["rows"][0]).toMatchObject({
      difficulty: 1,
      wateringHint: "alle 10 Tage",
      substrate: "Humus",
      pruning: "selten",
      successCriteria: "Dichte, flache Rosette.",
    });
  });

  it("does not list a species of which the only specimen is archived", async () => {
    const sub = `bes5-${randomUUID()}`;
    subjects.push(sub);
    const sp = await newSpecies(sub, "Gone", 2);
    const id = await specimen(sub, "A", sp);
    const a = await call(sub, "POST", `/specimens/${id}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "eingegangen",
    });
    expect(a.status).toBe(200);
    expect((await difficulty(sub)).body["rows"]).toEqual([]);
  });

  it("tenant: another account sees none of my species", async () => {
    const mara = `bes5-${randomUUID()}`;
    const ben = `bes5-${randomUUID()}`;
    subjects.push(mara, ben);
    await specimen(mara, "A", await newSpecies(mara, "Maras", 2));
    expect((await difficulty(mara)).body["rows"]).toHaveLength(1);
    expect((await difficulty(ben)).body["rows"]).toEqual([]);
  });
});
