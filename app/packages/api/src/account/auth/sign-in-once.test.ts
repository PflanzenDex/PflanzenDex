import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";
import { countingPool, type CountingPool } from "../../count-queries";

// NFR-12: the sign-in guard admits the account once per request. A path under `/x/*` is also `/x` itself, so a guard
// registered for both ran twice (an extra transaction and two lookups each time). Real PostgreSQL, `make db-up`.
type TokenVerifier = NonNullable<AppOptions["reviewer"]>;
const SIGN_IN = "select id from account where subject = $1"; // the lookup of `admitAccount` (db/account/sign-in.ts)
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub: sub ?? "", email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};

let owner: Pool;
let admin: Pool; // superuser fixture pool: cleanup only (QG-D1)
let counter: CountingPool;
let app: ReturnType<typeof createApp>;
const sub = `guard-${randomUUID()}`;

beforeAll(async () => {
  owner = openOwnerPool();
  admin = openFixturePool();
  await migrate(owner);
  counter = countingPool(owner);
  app = createApp({ reviewer, pool: counter.pool });
});

afterAll(async () => {
  await admin.query("delete from account where subject = $1", [sub]);
  await counter.pool.end();
  await admin.end();
});

describe("NFR-12 the sign-in guard resolves the account once per request", () => {
  it("NFR-12: one request resolves the account once, on the exact path and below it", async () => {
    const token = { authorization: `Bearer valid:${sub}` };
    // The first request creates the account; the sign-in lookup of a new subject runs twice (lookup, then create).
    expect((await app.request("/account", { headers: token })).status).toBe(200);
    const paths = [
      "/today?timeZone=Europe%2FBerlin",
      "/specimens",
      "/specimens/cards?timeZone=Europe%2FBerlin",
      "/wishes/candidates",
      "/account",
    ];
    for (const path of paths) {
      counter.reset();
      const res = await app.request(path, { headers: token });
      expect(res.status, `GET ${path}`).toBe(200);
      const lookups = counter.statements().filter((text) => text === SIGN_IN);
      expect(lookups, `GET ${path} looks the account up`).toHaveLength(1);
    }
  });

  it("NFR-12: a request without a token is refused before any database work", async () => {
    for (const path of ["/today?timeZone=Europe%2FBerlin", "/specimens", "/account"]) {
      counter.reset();
      const res = await app.request(path);
      expect(res.status, `GET ${path}`).toBe(401);
      expect(counter.count(), `GET ${path} without token`).toBe(0);
    }
  });
});
