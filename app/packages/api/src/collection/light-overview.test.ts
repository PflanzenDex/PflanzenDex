import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-LIC-03: light overview with position recommendations through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
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

const lightOverview = (sub: string | null) => call(sub, "GET", "/specimens/light-overview");

const newSpecies = async (sub: string, name: string, lux: number, level: number) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: level,
      lightDemandLux: lux,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;

const specimen = async (sub: string, name: string, speciesId: string, locationId?: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker: name,
      ...(locationId ? { locationId } : {}),
    })
  ).body["id"] as string;

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});

afterAll(async () => {
  if (subjects.length > 0) {
    await pool.query(
      "delete from specimen where account_id in (select id from account where subject = any($1))",
      [subjects],
    );
    await pool.query(
      `delete from species where id in (select object_id from review_case
         where account_id in (select id from account where subject = any($1)))`,
      [subjects],
    );
    await pool.query("delete from account where subject = any($1)", [subjects]);
  }
  await pool.end();
});

describe("US-LIC-03: light overview", () => {
  it("requires authentication", async () => {
    const r = await lightOverview(null);
    expect(r.status).toBe(401);
  });

  it("returns empty array when account has no specimens", async () => {
    const sub = `lic3-${randomUUID()}`;
    subjects.push(sub);

    const r = await lightOverview(sub);
    expect(r.status).toBe(200);
    expect(r.body.rows).toEqual([]);
  });

  it("returns species with active specimens and lux demand sorted by lux descending", async () => {
    const sub = `lic3-${randomUUID()}`;
    subjects.push(sub);

    const sp1 = await newSpecies(sub, "Low Light", 2000, 2);
    const sp2 = await newSpecies(sub, "Medium Light", 20000, 2);
    const sp3 = await newSpecies(sub, "High Light", 80000, 2);

    await specimen(sub, "Low", sp1);
    await specimen(sub, "Medium", sp2);
    await specimen(sub, "High", sp3);

    const r = await lightOverview(sub);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(3);

    // Check sorted order (descending by lux)
    expect(r.body.rows[0].lightDemandLux).toBe(80000);
    expect(r.body.rows[1].lightDemandLux).toBe(20000);
    expect(r.body.rows[2].lightDemandLux).toBe(2000);
  });

  it("includes position recommendations based on lux demand thresholds", async () => {
    const sub = `lic3-${randomUUID()}`;
    subjects.push(sub);

    // Test each threshold
    const specs = [
      { name: "UltraLight", lux: 60000, expectedCategory: "directly_under_lamp" },
      { name: "VeryClose", lux: 15000, expectedCategory: "very_close" },
      { name: "Close", lux: 8000, expectedCategory: "close" },
      { name: "Medium", lux: 4000, expectedCategory: "medium_distance" },
      { name: "Far", lux: 1000, expectedCategory: "further_away" },
    ];

    const speciesIds = await Promise.all(specs.map((s) => newSpecies(sub, s.name, s.lux, 2)));

    // Create specimens for each species (specs and speciesIds have the same length)
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const speciesId = speciesIds[i];
      if (spec && speciesId) {
        await specimen(sub, spec.name, speciesId);
      }
    }

    const r = await lightOverview(sub);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(5);

    // Verify position categories (sorted by lux descending)
    expect(r.body.rows[0].position.category).toBe("directly_under_lamp");
    expect(r.body.rows[1].position.category).toBe("very_close");
    expect(r.body.rows[2].position.category).toBe("close");
    expect(r.body.rows[3].position.category).toBe("medium_distance");
    expect(r.body.rows[4].position.category).toBe("further_away");
  });

  it("returns data with species name and light demand", async () => {
    const sub = `lic3-${randomUUID()}`;
    subjects.push(sub);

    const sp = await newSpecies(sub, "Philodendron", 18000, 2);
    await specimen(sub, "Phil", sp);

    const r = await lightOverview(sub);
    expect(r.status).toBe(200);
    expect(r.body.rows.length).toBeGreaterThanOrEqual(1);
    const row = r.body.rows.find((row: Record<string, unknown>) => row.speciesId === sp);
    expect(row).toMatchObject({
      speciesId: sp,
      speciesName: "Philodendron",
      lightDemandLux: 18000,
      zone: expect.objectContaining({ name: expect.any(String) }),
    });
  });
});
