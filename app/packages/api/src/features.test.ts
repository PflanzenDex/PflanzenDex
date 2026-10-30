import { randomUUID } from "node:crypto";
import { NO_FEATURES, knownFeatures } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "./app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-DEV-06: feature switches, globally and per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `ft-${randomUUID()}`;
const subB = `ft-${randomUUID()}`;
const RESOURCE = "https://pflanzendex.example/mcp";
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const ids: Record<string, string> = {};
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split("|");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const aiVerifier: TokenVerifier = async (token) => {
  const [kind, sub, client, scope] = token.split("|");
  return kind === "ai"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true, azp: client, scope }
    : null;
};
const off = () =>
  createApp({
    reviewer,
    pool,
    features: NO_FEATURES,
    ai: { resource: RESOURCE, issuer: "https://issuer.example", verifier: aiVerifier },
  });
const on = () =>
  createApp({
    reviewer,
    pool,
    features: knownFeatures(["social", "ai", "recommendations"]),
    ai: { resource: RESOURCE, issuer: "https://issuer.example", verifier: aiVerifier },
  });
const web = (sub: string) => ({ authorization: `Bearer valid|${sub}` });
const SOCIAL = [
  "/friends",
  "/feed",
  "/sharing",
  "/offers",
  "/swaps",
  "/equipment/sharing",
  "/exchange/offers",
  "/exchange/match",
];
const aiToken = (sub: string) => ({ authorization: `Bearer ai|${sub}|${CLIENT}|pflanzen:read` });
const json = async (res: Response) => (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const open = (sub: string, feature: string) =>
  admin.query(
    "insert into account_feature (account, feature) values ($1, $2) on conflict do nothing",
    [ids[sub], feature],
  );
const close = (sub: string) =>
  admin.query("delete from account_feature where account = $1", [ids[sub]]);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  for (const sub of [subA, subB])
    ids[sub] = (await json(await on().request("/account", { headers: web(sub) })))["id"];
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [Object.values(ids)]);
  await admin.end();
  await pool.end();
});

describe("US-DEV-06 feature switches", () => {
  it("US-DEV-06 globally off: social paths answer 404 like a path that does not exist", async () => {
    const unknown = await off().request("/no-such-path", { headers: web(subA) });
    for (const path of SOCIAL) {
      const res = await off().request(path, { headers: web(subA) });
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).toBe(await unknown.clone().text());
    }
  });

  it("US-DEV-06 globally off: the AI keeper routes and the MCP interface answer 404", async () => {
    expect((await off().request("/ai/connections", { headers: web(subA) })).status).toBe(404);
    expect((await off().request("/mcp/session", { headers: aiToken(subA) })).status).toBe(404);
  });

  it("US-DEV-06 globally on: the same paths are reachable", async () => {
    for (const path of SOCIAL)
      expect((await on().request(path, { headers: web(subA) })).status, path).not.toBe(404);
    expect((await on().request("/ai/connections", { headers: web(subA) })).status).toBe(200);
  });

  it("US-DEV-06 the account switch opens the function for that account only (two accounts)", async () => {
    await open(subA, "social");
    try {
      expect((await off().request("/friends", { headers: web(subA) })).status).toBe(200);
      expect((await off().request("/friends", { headers: web(subB) })).status).toBe(404);
      // Opening social does not open AI.
      expect((await off().request("/ai/connections", { headers: web(subA) })).status).toBe(404);
    } finally {
      await close(subA);
    }
  });

  it("US-DEV-06 the account switch for ai opens the interface for that account", async () => {
    await open(subA, "ai");
    try {
      expect((await off().request("/ai/connections", { headers: web(subA) })).status).toBe(200);
      expect((await off().request("/mcp/session", { headers: aiToken(subA) })).status).not.toBe(
        404,
      );
      expect((await off().request("/mcp/session", { headers: aiToken(subB) })).status).toBe(404);
    } finally {
      await close(subA);
    }
  });

  it("US-DEV-06 GET /account tells the web the effective state per function", async () => {
    await open(subA, "ai");
    try {
      const a = await json(await off().request("/account", { headers: web(subA) }));
      expect(a["features"]).toEqual({ social: false, ai: true, recommendations: false });
      const b = await json(await off().request("/account", { headers: web(subB) }));
      expect(b["features"]).toEqual({ social: false, ai: false, recommendations: false });
      const all = await json(await on().request("/account", { headers: web(subB) }));
      expect(all["features"]).toEqual({ social: true, ai: true, recommendations: true });
    } finally {
      await close(subA);
    }
  });

  it("US-DEV-06 switching off keeps the data, switching on restores it", async () => {
    const headers = { ...web(subA), "content-type": "application/json" };
    const made = await on().request("/equipment", {
      method: "POST",
      headers: { ...headers, "idempotency-key": randomUUID() },
      body: JSON.stringify({ type: "Timer", name: "Timer 1" }),
    });
    const equipmentId = (await json(made))["equipment"]["id"];
    const share = await on().request(`/equipment/${equipmentId}/sharing`, {
      method: "PUT",
      headers: { ...headers, "idempotency-key": randomUUID() },
      body: JSON.stringify({ share: "friends", note: "ok" }),
    });
    expect(share.status).toBe(200);
    const before = await json(await on().request("/equipment/sharing", { headers: web(subA) }));
    expect((await off().request("/equipment/sharing", { headers: web(subA) })).status).toBe(404);
    const after = await json(await on().request("/equipment/sharing", { headers: web(subA) }));
    expect(after).toEqual(before);
    expect(after["shared"]).toHaveLength(1);
  });
});
