import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

// US-ACH-08: calm mode per account through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cleanup (QG-D1)
const subA = `ach08-${randomUUID()}`;
const subB = `ach08-${randomUUID()}`;
const reviewer: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
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
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const settings = (sub: string | null) => call(sub, "GET", "/achievements/settings");
const setCalm = (sub: string | null, calmMode: unknown) =>
  call(sub, "PUT", "/achievements/settings/calm-mode", { calmMode });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-ACH-08 calm mode through the API", () => {
  it("US-ACH-08 without a token: 401 on both routes", async () => {
    expect((await settings(null)).status).toBe(401);
    expect((await setCalm(null, true)).status).toBe(401);
  });

  it("US-ACH-08 a new account has calm mode off", async () => {
    const r = await settings(subA);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ calmMode: false });
  });

  it("US-ACH-08 invalid input: 400 input.invalid and nothing is written", async () => {
    for (const bad of ["true", 1, null, undefined]) {
      const r = await setCalm(subA, bad);
      expect(r.status).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
    }
    expect((await settings(subA)).body).toEqual({ calmMode: false });
  });

  it("US-ACH-08 switches on and off again, per account (P-04)", async () => {
    expect((await setCalm(subA, true)).body).toEqual({ calmMode: true });
    expect((await settings(subA)).body).toEqual({ calmMode: true });
    expect((await settings(subB)).body).toEqual({ calmMode: false });
    expect((await setCalm(subA, false)).body).toEqual({ calmMode: false });
    expect((await settings(subA)).body).toEqual({ calmMode: false });
  });
});
