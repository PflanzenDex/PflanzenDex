import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localToday } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-04 through the API (real PostgreSQL): operation and maintenance, checks due, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ4-${randomUUID()}`;
const subB = `equ4-${randomUUID()}`;
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

const device = async (sub: string, type: string, name: string) =>
  (await call(sub, "POST", "/equipment", { type, name })).body["equipment"].id as string;
const due = async (sub: string) =>
  (await call(sub, "GET", "/equipment/checks-due?timeZone=Europe/Berlin")).body["due"] as {
    id: string;
    lastCheckedOn: string | null;
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
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-04 operation and maintenance through the API", () => {
  it("US-EQU-04 a device without an interval is never due; with an interval it is, until it is checked", async () => {
    const id = await device(subA, "Timer", "Timer-Wartung");
    expect((await due(subA)).map((d) => d.id)).not.toContain(id);
    const set = await call(subA, "POST", `/equipment/${id}/maintenance`, {
      inOperationSince: "2020-01-01",
      checkIntervalDays: 30,
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ inOperationSince: "2020-01-01", checkIntervalDays: 30 });
    expect((await due(subA)).map((d) => d.id)).toContain(id);
    const today = localToday(new Date(), "Europe/Berlin");
    const checked = await call(subA, "POST", `/equipment/${id}/checked`, { checkedOn: today });
    expect(checked.body).toMatchObject({ lastCheckedOn: today });
    expect((await due(subA)).map((d) => d.id)).not.toContain(id);
  });

  it("US-EQU-04 the lifetime needs its source, an interval out of range is refused", async () => {
    const id = await device(subA, "Ventilation", "Luefter-Lebensdauer");
    const noSource = await call(subA, "POST", `/equipment/${id}/maintenance`, {
      lifetimeValue: "50.000 h",
    });
    expect(noSource.status).toBe(400);
    expect(noSource.body["error"].code).toBe("input.invalid");
    const range = await call(subA, "POST", `/equipment/${id}/maintenance`, {
      checkIntervalDays: 0,
    });
    expect(range.status).toBe(400);
  });

  it("US-EQU-04 a consumable has no operation data", async () => {
    const id = await device(subA, "Substrate", "Erde-Wartung");
    const r = await call(subA, "POST", `/equipment/${id}/maintenance`, { checkIntervalDays: 7 });
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("equipment.not_a_device");
  });

  it("US-EQU-04 asking for the checks needs a valid time zone", async () => {
    const r = await call(subA, "GET", "/equipment/checks-due?timeZone=Nowhere");
    expect(r.status).toBe(400);
  });

  it("P-04 another account neither sees nor changes the maintenance of a device", async () => {
    const id = await device(subA, "Pump", "Pumpe-Fremd");
    await call(subA, "POST", `/equipment/${id}/maintenance`, { checkIntervalDays: 10 });
    expect(await due(subB)).toEqual([]);
    const set = await call(subB, "POST", `/equipment/${id}/maintenance`, { checkIntervalDays: 1 });
    expect(set.status).toBe(404);
    const checked = await call(subB, "POST", `/equipment/${id}/checked`, {
      checkedOn: "2026-10-01",
    });
    expect(checked.status).toBe(404);
  });
});
