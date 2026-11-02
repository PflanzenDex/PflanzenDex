import { randomUUID } from "node:crypto";
import { InMemoryObjectStore } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

// US-KI-06: the daily limit per connection through the AI interface (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let app: ReturnType<typeof createApp>;
const subA = `ki6-${randomUUID()}`;
const subB = `ki6-${randomUUID()}`;
const NOW = new Date("2026-10-10T12:00:00Z");
const LIMIT = 2;

const send = (token: string, path: string, method = "GET") =>
  app.request(path, {
    method,
    headers: { authorization: `Bearer ${token}`, "idempotency-key": randomUUID() },
  });
const ai = (sub: string) => `ai|${sub}|https://client.example/${sub}|pflanzen:read`;
const status = (sub: string) => send(ai(sub), "/mcp/status?timeZone=Europe%2FBerlin");

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({
    reviewer: async (t) =>
      t.startsWith("valid:")
        ? { sub: t.slice(6), email: "x@example.test", name: "T", email_verified: true }
        : null,
    pool,
    clock: () => NOW,
    media: { store: new InMemoryObjectStore(), processor: {} as never },
    ai: {
      verifier: async (t) => {
        const [kind, sub, client, scope] = t.split("|");
        return kind === "ai"
          ? {
              sub,
              email: `${sub}@example.test`,
              name: "T",
              email_verified: true,
              azp: client,
              scope,
            }
          : null;
      },
      resource: "https://pflanzendex.example/mcp",
      issuer: "https://login.example/realms/p",
      clock: () => NOW,
      dailyLimit: LIMIT,
    },
  });
  for (const sub of [subA, subB]) await send(`valid:${sub}`, "/account");
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-KI-06 limits", () => {
  it("US-KI-06 FR-KI-11 after the daily limit the client gets 429 ai.rate_limited with Retry-After; a connection of another account is unaffected", async () => {
    for (let i = 0; i < LIMIT; i++) expect((await status(subA)).status).toBe(200);
    const blocked = await status(subA);
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      "ai.rate_limited",
    );
    expect(blocked.headers.get("retry-after")).toBe(String(12 * 3600));
    expect((await status(subB)).status).toBe(200);
  });

  it("US-KI-06 FR-KI-05 the keeper's own screens keep working when the client is limited", async () => {
    expect((await send(`valid:${subA}`, "/ai/connections")).status).toBe(200);
    expect((await send(`valid:${subA}`, "/ai/log")).status).toBe(200);
  });
});
