import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NO_FEATURES } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-10 through the API (real PostgreSQL): operation and maintenance, checks due, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ10-${randomUUID()}`;
const subB = `equ10-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
const catalog = [
  {
    productId: "soil-1",
    name: "Kakteenerde",
    manufacturer: "Erdewerk",
    serves: ["supply_low"],
    fit: 0.8,
    source: "https://example.org/erde",
    retrievedOn: "2026-10-01",
  },
] as const;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer valid:${sub}`,
  };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const create = async (sub: string, type: string, name: string, extra = {}) =>
  (await call(sub, "POST", "/equipment", { type, name, ...extra })).body["equipment"] as {
    id: string;
  };
beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, products: catalog });
});
afterAll(async () => {
  await admin.query(
    "delete from equipment where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

const recs = async (sub: string) =>
  (await call(sub, "GET", "/equipment/recommendations")).body["recommendations"] as {
    needId: string;
    productId: string;
    label: string;
    source: string;
    retrievedOn: string;
  }[];

describe("US-EQU-10 recommendations through the API", () => {
  it("US-EQU-10 no need, no recommendation", async () => {
    expect(await recs(subA)).toEqual([]);
  });

  it("US-EQU-10 a low consumable gets a labeled suggestion with source and date; another account sees none (P-04)", async () => {
    const soil = await create(subA, "Substrate", "Erde-Empfehlung");
    await call(subA, "POST", `/equipment/${soil.id}/supply`, { supply: "low" });
    const list = await recs(subA);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      needId: `supply:${soil.id}`,
      productId: "soil-1",
      label: "Empfehlung",
      source: "https://example.org/erde",
      retrievedOn: "2026-10-01",
    });
    expect(await recs(subB)).toEqual([]);
  });

  it("US-EQU-10 answers 404 while the recommendations switch is off, needs stay reachable", async () => {
    const off = createApp({ reviewer, pool, products: catalog, features: NO_FEATURES });
    const headers = { authorization: `Bearer valid:${subA}` };
    expect((await off.request("/equipment/recommendations", { headers })).status).toBe(404);
    expect((await off.request("/equipment/needs", { headers })).status).toBe(200);
  });
});
