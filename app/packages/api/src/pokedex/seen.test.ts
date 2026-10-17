import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

// US-POK-12: the seen state of the Pokédex per account through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cleanup (QG-D1)
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `pok12-${randomUUID()}`;
const subB = `pok12-${randomUUID()}`;
const reviewer: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: ReturnType<typeof createApp>;

async function call(sub: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() } as Response;
}
const seen = (sub: string | null) => call(sub, "GET", "/pokedex/seen");
const markSeen = (sub: string | null, species: unknown) =>
  call(sub, "POST", "/pokedex/seen", { species });

/** A species with one active specimen, so it counts as caught (US-POK-06). */
async function catchSpecies(sub: string, latinName: string): Promise<void> {
  const created = await call(sub, "POST", "/species", {
    latinName,
    germanName: latinName,
    difficulty: 2,
    standardLevel: 2,
    lightDemandLux: 15000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const speciesId = created.body["id"] as string;
  const r = await call(sub, "POST", "/specimens", {
    timeZone: "Europe/Berlin",
    speciesId,
    marker: `m${run}`,
  });
  expect(r.status).toBe(201);
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
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

describe("US-POK-12 seen state: sign-in and shape", () => {
  it("US-POK-12 without a token: 401 on both routes", async () => {
    expect((await seen(null)).status).toBe(401);
    expect((await markSeen(null, [])).status).toBe(401);
  });

  it("US-POK-12 an account without state reads null (first visit)", async () => {
    const r = await seen(subA);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ seen: null });
  });

  it("US-POK-12 invalid input: 400 input.invalid and nothing is written", async () => {
    for (const species of ["Aloe vera", [1], [""], undefined]) {
      const r = await markSeen(subA, species);
      expect(r.status).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
    }
    expect((await seen(subA)).body).toEqual({ seen: null });
  });

  it("US-POK-12 a write without Idempotency-Key is refused", async () => {
    const res = await app.request("/pokedex/seen", {
      method: "POST",
      headers: { authorization: `Bearer valid:${subA}`, "content-type": "application/json" },
      body: JSON.stringify({ species: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("US-POK-12 seen state: write and tenant isolation (P-04)", () => {
  const aloe = `Aloe${run} vera`;
  it("US-POK-12 creates the state with the caught species and reads it back", async () => {
    await catchSpecies(subA, aloe);
    const r = await markSeen(subA, [aloe]);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ seen: [aloe] });
    expect((await seen(subA)).body).toEqual({ seen: [aloe] });
  });

  it("US-POK-12 refuses a species that is not caught: 409 pokedex.not_caught, nothing changes", async () => {
    const r = await markSeen(subA, [`Ficus${run} lyrata`]);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("pokedex.not_caught");
    expect((await seen(subA)).body).toEqual({ seen: [aloe] });
  });

  it("US-POK-12 another account sees no state of account A and cannot mark A's species", async () => {
    expect((await seen(subB)).body).toEqual({ seen: null });
    const r = await markSeen(subB, [aloe]);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("pokedex.not_caught");
    expect((await seen(subB)).body).toEqual({ seen: null });
    expect((await seen(subA)).body).toEqual({ seen: [aloe] });
  });

  it("US-POK-12 account B creates its own state without touching A's", async () => {
    expect((await markSeen(subB, [])).body).toEqual({ seen: [] });
    expect((await seen(subB)).body).toEqual({ seen: [] });
    expect((await seen(subA)).body).toEqual({ seen: [aloe] });
  });
});
