import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp } from "../app";

// US-LIC-05: locations and light zones via the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const subA = `licht-${randomUUID()}`;
const subB = `licht-${randomUUID()}`;
type TokenVerifier = NonNullable<NonNullable<Parameters<typeof createApp>[0]>["reviewer"]>;
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

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await pool.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-LIC-05 sign-in and input", () => {
  it.each([
    ["GET", "/light-zones"],
    ["POST", "/light-zones"],
    ["GET", "/locations"],
    ["GET", "/hints"],
  ])("%s %s without token: 401", async (method, path) => {
    expect((await call(null, method, path, method === "POST" ? {} : undefined)).status).toBe(401);
  });

  it("without Idempotency-Key: 400 with a stable error code", async () => {
    const r = await call(subA, "POST", "/light-zones", { name: "X", luxCeiling: 1 }, null);
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
  });

  it("invalid input: 400 with the affected fields", async () => {
    const r = await call(subA, "POST", "/light-zones", { name: "", luxCeiling: -5 });
    expect(r.status).toBe(400);
    expect(r.body["error"].details.map((d: { field: string }) => d.field)).toEqual([
      "name",
      "luxCeiling",
    ]);
  });
});

describe("US-LIC-05 manage light zones and locations", () => {
  it("creates zone and locations, renames and keeps the assignment", async () => {
    const z = await call(subA, "POST", "/light-zones", {
      name: "Regal oben",
      luxCeiling: 15000,
      ppfd: 300,
    });
    expect(z.status).toBe(201);
    const s = await call(subA, "POST", "/locations", {
      name: "Fensterbank",
      lightZoneId: z.body["id"],
      kind: "indoor",
    });
    expect(s.status).toBe(201);
    const around = await call(subA, "PUT", `/light-zones/${z.body["id"]}`, {
      name: "Unterholz",
      luxCeiling: 12000,
    });
    expect(around).toMatchObject({
      status: 200,
      body: { id: z.body["id"], name: "Unterholz", ppfd: null },
    });
    const list = await call(subA, "GET", "/locations");
    expect(list.body["locations"]).toEqual([
      { id: s.body["id"], name: "Fensterbank", lightZoneId: z.body["id"], kind: "indoor" },
    ]);
  });

  it("the same Idempotency-Key creates nothing twice", async () => {
    const key = randomUUID();
    const a = await call(subA, "POST", "/light-zones", { name: "Einmalig", luxCeiling: 5000 }, key);
    const b = await call(subA, "POST", "/light-zones", { name: "Einmalig", luxCeiling: 5000 }, key);
    expect(b).toEqual(a);
    const names = (await call(subA, "GET", "/light-zones")).body["zones"].map(
      (x: { name: string }) => x.name,
    );
    expect(names.filter((n: string) => n === "Einmalig")).toHaveLength(1);
  });

  it("duplicate name: 409", async () => {
    await call(subA, "POST", "/locations", { name: "Doppelt", kind: "indoor" });
    const r = await call(subA, "POST", "/locations", { name: "doppelt", kind: "outdoor" });
    expect(r).toMatchObject({ status: 409, body: { error: { code: "location.name_taken" } } });
  });

  it("deleting a zone is rejected and names the using locations; afterwards it works", async () => {
    const z = await call(subA, "POST", "/light-zones", { name: "Belegt", luxCeiling: 5000 });
    const s = await call(subA, "POST", "/locations", {
      name: "Auf Belegt",
      lightZoneId: z.body["id"],
      kind: "indoor",
    });
    const rejected = await call(subA, "DELETE", `/light-zones/${z.body["id"]}`);
    expect(rejected).toMatchObject({
      status: 409,
      body: { error: { code: "light_zone.in_use" } },
    });
    expect(rejected.body["error"].data).toEqual([
      { kind: "location", id: s.body["id"], name: "Auf Belegt" },
    ]);
    await call(subA, "PUT", `/locations/${s.body["id"]}`, {
      name: "Auf Belegt",
      lightZoneId: null,
      kind: "indoor",
    });
    expect((await call(subA, "DELETE", `/light-zones/${z.body["id"]}`)).status).toBe(200);
  });

  it("locations without a zone appear in the hints", async () => {
    await call(subB, "POST", "/locations", { name: "Balkon", kind: "outdoor" });
    const r = await call(subB, "GET", "/hints");
    expect(r.body["hints"]).toEqual([
      expect.objectContaining({
        kind: "location_without_zone",
        text: expect.stringContaining("Balkon"),
      }),
    ]);
  });

  it("the default creates four lamps, a second time it is rejected", async () => {
    const r = await call(subB, "POST", "/light-zones/defaults");
    expect(r.status).toBe(201);
    expect(r.body["zones"].map((z: { name: string }) => z.name)).toEqual([
      "Lampe 1",
      "Lampe 2",
      "Lampe 3",
      "Lampe 4",
    ]);
    const again = await call(subB, "POST", "/light-zones/defaults");
    expect(again).toMatchObject({
      status: 409,
      body: { error: { code: "light_zone.not_empty" } },
    });
  });
});

describe("US-LIC-05 tenant isolation via the API (P-04)", () => {
  it("foreign zones and locations are invisible, unchangeable and not assignable", async () => {
    const z = await call(subA, "POST", "/light-zones", { name: "Privat A", luxCeiling: 1000 });
    const s = await call(subA, "POST", "/locations", { name: "Privat A Platz", kind: "indoor" });
    const viewB = await call(subB, "GET", "/light-zones");
    expect(JSON.stringify(viewB.body)).not.toContain("Privat A");
    expect(
      (await call(subB, "PUT", `/light-zones/${z.body["id"]}`, { name: "Weg", luxCeiling: 1 }))
        .status,
    ).toBe(404);
    expect((await call(subB, "DELETE", `/light-zones/${z.body["id"]}`)).status).toBe(404);
    expect(
      (await call(subB, "PUT", `/locations/${s.body["id"]}`, { name: "Weg", kind: "indoor" }))
        .status,
    ).toBe(404);
    const assign = await call(subB, "POST", "/locations", {
      name: "Klau",
      lightZoneId: z.body["id"],
      kind: "indoor",
    });
    expect(assign).toMatchObject({
      status: 404,
      body: { error: { code: "light_zone.not_found" } },
    });
  });
});
