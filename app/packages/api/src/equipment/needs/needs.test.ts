import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-07 through the API (real PostgreSQL): operation and maintenance, checks due, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ7-${randomUUID()}`;
const subB = `equ7-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
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
const needs = async (sub: string) =>
  (await call(sub, "GET", "/equipment/needs")).body["needs"] as {
    id: string;
    kind: string;
    nextAction: string;
  }[];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  const owned = "account_id in (select id from account where subject = any($1))";
  await admin.query(`delete from equipment where ${owned}`, [[subA, subB]]);
  await admin.query(`delete from wish where ${owned}`, [[subA, subB]]);
  await admin.query(`delete from light_zone where ${owned}`, [[subA, subB]]);
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-07 what is missing through the API", () => {
  it("US-EQU-07 a low consumable and a broken device without replacement are listed with a next action", async () => {
    expect(await needs(subA)).toEqual([]);
    const soil = await create(subA, "Substrate", "Erde-Bedarf");
    await call(subA, "POST", `/equipment/${soil.id}/supply`, { supply: "low" });
    const timer = await create(subA, "Timer", "Timer-Bedarf");
    await call(subA, "POST", `/equipment/${timer.id}/status`, { status: "defective" });
    const list = await needs(subA);
    expect(list.map((n) => n.id).sort()).toEqual(
      [`replace:${timer.id}`, `supply:${soil.id}`].sort(),
    );
    for (const n of list) expect(n.nextAction.length).toBeGreaterThan(0);
    await call(subA, "POST", `/equipment/${soil.id}/supply`, { supply: "available" });
    expect((await needs(subA)).map((n) => n.id)).toEqual([`replace:${timer.id}`]);
  });

  it("US-EQU-07 a wish with a target zone without an active lamp is listed", async () => {
    const zones = (await call(subA, "POST", "/light-zones/defaults", {})).body["zones"] as {
      id: string;
      name: string;
    }[];
    const zone = zones.find((z) => z.name === "Lampe 3")?.id as string;
    const wish = await call(subA, "POST", "/wishes", {
      name: "Wunschpflanze Bedarf",
      targetZoneId: zone,
    });
    expect(wish.status).toBe(201);
    expect((await needs(subA)).map((n) => n.id)).toContain(`wish-zone:${zone}`);
    await create(subA, "Lamp", "Lampe-Bedarf", { lightZoneId: zone });
    expect((await needs(subA)).map((n) => n.id)).not.toContain(`wish-zone:${zone}`);
  });

  it("P-04 another account sees none of it", async () => {
    expect(await needs(subB)).toEqual([]);
  });
});
