import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ERROR_TEXTS, NO_FEATURES } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-ACC-01: an account whose email address is not confirmed cannot share data with friends. Every friend, sharing,
// feed, offer, exchange and swap route answers 403 `account.email_unconfirmed` and writes nothing; a confirmed account
// is not refused for its email (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup, cleanup and the write check (QG-D1)
const unconfirmedSub = `acc01-no-${randomUUID()}`;
const confirmedSub = `acc01-yes-${randomUUID()}`;
let unconfirmedId = "";
let app: ReturnType<typeof createApp>;

// "valid:<sub>:yes|no" is a valid token; the flag is the email confirmation of the token claim (token.test.ts verifies tokens).
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub, verified] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: verified === "yes" }
    : null;
};
const bearer = (sub: string, verified: boolean) => `Bearer valid:${sub}:${verified ? "yes" : "no"}`;

type Route = { route: string; method: "GET" | "POST"; path: string; body?: unknown; ok: number };
// One representative route per path group of friends-bindings.ts, and one write that needs an Idempotency-Key.
const ROUTES: Route[] = [
  { route: "GET /friends", method: "GET", path: "/friends", ok: 200 },
  { route: "GET /sharing", method: "GET", path: "/sharing", ok: 200 },
  { route: "GET /feed", method: "GET", path: "/feed?timeZone=Europe/Berlin&days=30", ok: 200 },
  { route: "GET /offers", method: "GET", path: "/offers?timeZone=Europe/Berlin", ok: 200 },
  {
    route: "GET /exchange/offers",
    method: "GET",
    path: "/exchange/offers?timeZone=Europe/Berlin",
    ok: 200,
  },
  { route: "GET /swaps", method: "GET", path: "/swaps", ok: 200 },
  {
    route: "POST /friends/invitations",
    method: "POST",
    path: "/friends/invitations",
    body: {},
    ok: 201,
  },
];

function send(r: Route, sub: string, verified: boolean, target = app) {
  const headers: Record<string, string> = { authorization: bearer(sub, verified) };
  if (r.method === "POST") {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = randomUUID();
  }
  return target.request(r.path, {
    method: r.method,
    headers,
    ...(r.body === undefined ? {} : { body: JSON.stringify(r.body) }),
  });
}

// Every write of an account records its Idempotency-Key row first (`write`); a refused request records none.
async function writesOf(accountId: string): Promise<number> {
  const r = await admin.query<{ n: string }>(
    "select count(*)::text as n from idempotency where account_id = $1",
    [accountId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  const me = await app.request("/account", {
    headers: { authorization: bearer(unconfirmedSub, false) },
  });
  unconfirmedId = ((await me.json()) as { id: string }).id;
  await app.request("/account", { headers: { authorization: bearer(confirmedSub, true) } });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [
    [unconfirmedSub, confirmedSub],
  ]);
  await pool.end();
  await admin.end();
});

describe("US-ACC-01 sharing with friends needs a confirmed email address", () => {
  it.each(ROUTES)(
    "US-ACC-01 $route: an unconfirmed account gets 403 account.email_unconfirmed and nothing is written",
    async (r) => {
      const before = await writesOf(unconfirmedId);
      const res = await send(r, unconfirmedSub, false);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: {
          code: "account.email_unconfirmed",
          text: ERROR_TEXTS["account.email_unconfirmed"],
        },
      });
      expect(await writesOf(unconfirmedId)).toBe(before);
    },
  );

  it.each(ROUTES)(
    "US-ACC-01 $route: a confirmed account is not refused for its email",
    async (r) => {
      const res = await send(r, confirmedSub, true);
      expect(res.status).toBe(r.ok);
    },
  );

  it("US-ACC-01 with social switched off the paths answer 404 before the email check (US-DEV-06)", async () => {
    const off = createApp({ reviewer, pool, features: NO_FEATURES });
    for (const r of ROUTES)
      expect((await send(r, unconfirmedSub, false, off)).status, r.route).toBe(404);
  });
});
