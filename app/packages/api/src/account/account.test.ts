import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp } from "../app";
import { onlyWithConfirmedEmail, type TokenVerifier } from "./index";

// US-ACC-01: the API verifies the token and sets the account per request (withAccount). Database: `make db-up`.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and cross-tenant observation (QG-D1)
const sub1 = `api-${randomUUID()}`;
const sub2 = `api-${randomUUID()}`;

// Instead of the sign-in service: "valid:<sub>:<verified>" is a valid token (the verification itself is tested by token.test.ts).
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub, verified] = token.split(":");
  if (kind !== "valid") return null;
  return {
    sub,
    email: `${sub}@example.test`,
    name: "Lena Test",
    email_verified: verified === "yes",
  };
};
const using = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
type AccountResponse = { id: string; email: string };
const account = async (app: ReturnType<typeof createApp>, init: object) =>
  (await (await app.request("/account", init)).json()) as AccountResponse & Record<string, unknown>;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[sub1, sub2]]);
  await pool.end();
  await admin.end();
});

describe("GET /account (US-ACC-01)", () => {
  it("without token: 401 without a hint about the reason", async () => {
    const res = await createApp({ reviewer, pool }).request("/account");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(await res.json()).toEqual({ error: { code: "not_signed_in" } });
  });

  it("with invalid token: 401", async () => {
    const res = await createApp({ reviewer, pool }).request("/account", using("kaputt"));
    expect(res.status).toBe(401);
  });

  it("creates the account with account data on the first request and returns it", async () => {
    const app = createApp({ reviewer, pool });
    const res = await app.request("/account", using(`valid:${sub1}:no`));
    expect(res.status).toBe(200);
    const k = (await res.json()) as AccountResponse;
    expect(k).toMatchObject({
      email: `${sub1}@example.test`,
      displayName: "Lena Test",
      emailConfirmed: false,
      mayShareWithFriends: false,
    });
    const second = await account(app, using(`valid:${sub1}:no`));
    expect(second.id).toBe(k.id);
  });

  it("first sign-in creates exactly one account row, later and parallel sign-ins reuse it", async () => {
    const sub = `api-${randomUUID()}`;
    try {
      const app = createApp({ reviewer, pool });
      const rows = async () =>
        (await admin.query("select id from account where subject = $1", [sub])).rows;
      expect(await rows()).toHaveLength(0);
      const first = await account(app, using(`valid:${sub}:no`));
      expect(await rows()).toHaveLength(1);
      const later = await Promise.all([1, 2, 3].map(() => account(app, using(`valid:${sub}:no`))));
      expect(later.map((a) => a.id)).toEqual([first.id, first.id, first.id]);
      expect(await rows()).toHaveLength(1);
    } finally {
      await admin.query("delete from account where subject = $1", [sub]);
    }
  });

  it("takes the email confirmation from the token", async () => {
    const app = createApp({ reviewer, pool });
    const before = await account(app, using(`valid:${sub2}:no`));
    const after = await account(app, using(`valid:${sub2}:yes`));
    expect(after.id).toBe(before.id);
    expect(after).toMatchObject({ emailConfirmed: true, mayShareWithFriends: true });
  });

  it("each person sees only their own account", async () => {
    const app = createApp({ reviewer, pool });
    const a = await account(app, using(`valid:${sub1}:no`));
    const b = await account(app, using(`valid:${sub2}:yes`));
    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
  });

  it("/health stays reachable without sign-in", async () => {
    const res = await createApp({ reviewer, pool }).request("/health");
    expect(res.status).toBe(200);
  });
});

describe("sharing with friends only with a confirmed email address (US-ACC-01)", () => {
  function app() {
    const a = createApp({ reviewer, pool });
    a.post("/account/test-share", onlyWithConfirmedEmail, (c) => c.json({ shared: true }));
    return a;
  }

  it("unconfirmed: 403 with a clear next action", async () => {
    const res = await app().request("/account/test-share", {
      method: "POST",
      ...using(`valid:${sub1}:no`),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "email_unbestaetigt" } });
  });

  it("confirmed: allowed", async () => {
    const res = await app().request("/account/test-share", {
      method: "POST",
      ...using(`valid:${sub2}:yes`),
    });
    expect(res.status).toBe(200);
  });
});
