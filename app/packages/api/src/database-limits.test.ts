import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openPool, testOwnerUrl, withAccount } from "@pflanzendex/db";
import { createApp } from "./app";

// NFR-12 (#1242): a database that does not answer in time answers 503 with the stable code `system.database_unavailable`,
// a failure nobody expected answers 500 with `system.unexpected`; the cause is never sent. Real PostgreSQL (`make db-up`).
type TokenVerifier = NonNullable<NonNullable<Parameters<typeof createApp>[0]>["reviewer"]>;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub: sub ?? "", email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const PROBE_ACCOUNT = randomUUID();
const subjects: string[] = [];
const newSubject = () => {
  const sub = `limits-${randomUUID()}`;
  subjects.push(sub);
  return sub;
};

let admin: Pool;
// Statement and lock limits of 100 ms: any probe statement or lock wait longer than that is cut.
let slowPool: Pool;
// One connection and a 200 ms wait for it: the second request cannot get a connection.
let tinyPool: Pool;

beforeAll(async () => {
  const setup = openPool(testOwnerUrl());
  await migrate(setup);
  await setup.end();
  admin = openFixturePool();
  slowPool = openPool(testOwnerUrl(), false, {
    limits: { statementMs: 100, lockMs: 100, idleInTransactionMs: 30000 },
  });
  tinyPool = openPool(testOwnerUrl(), false, { max: 1, connectionTimeoutMs: 200 });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [subjects]);
  await slowPool.end();
  await tinyPool.end();
  await admin.end();
});

/** The app on `pool`, with two probe routes that are not part of the product: a slow statement and a crash. */
function appOn(pool: Pool) {
  const app = createApp({ reviewer, pool });
  app.get("/probe/slow", async (c) => {
    await withAccount(pool, PROBE_ACCOUNT, (client) => client.query("select pg_sleep(0.5)"));
    return c.text("done");
  });
  app.get("/probe/crash", () => {
    throw new Error("secret detail of the cause");
  });
  return app;
}

async function call(
  app: ReturnType<typeof appOn>,
  method: string,
  path: string,
  sub: string | null = null,
  body?: unknown,
) {
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

describe("NFR-12 database limits answer with stable codes", () => {
  it("NFR-12 a statement over the limit answers 503 with system.database_unavailable, without the cause", async () => {
    const r = await call(appOn(slowPool), "GET", "/probe/slow");
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ error: { code: "system.database_unavailable" } });
    expect(JSON.stringify(r.body)).not.toContain("pg_sleep");
  });

  it("NFR-12 a write that waits too long for a lock answers 503 with the same code, and nothing changes", async () => {
    const sub = newSubject();
    const app = appOn(slowPool);
    const created = await call(app, "POST", "/light-zones", sub, {
      name: "Sperre",
      luxCeiling: 1000,
    });
    expect(created.status).toBe(201);
    const id = created.body["id"] as string;
    const holder = await admin.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from light_zone where id = $1 for update", [id]);
      const r = await call(app, "PUT", `/light-zones/${id}`, sub, {
        name: "Gesperrt",
        luxCeiling: 1000,
      });
      expect(r.status).toBe(503);
      expect(r.body).toMatchObject({ error: { code: "system.database_unavailable" } });
    } finally {
      await holder.query("rollback");
      holder.release();
    }
    const kept = await call(app, "GET", "/light-zones", sub);
    expect(kept.status).toBe(200);
    expect(JSON.stringify(kept.body)).toContain("Sperre");
  });

  it("NFR-12 pool exhaustion: a request waits for a connection at most the connection timeout, then answers with the stable code", async () => {
    const held = await tinyPool.connect();
    try {
      const started = Date.now();
      const r = await call(appOn(tinyPool), "GET", "/light-zones", newSubject());
      expect(Date.now() - started).toBeLessThan(2000);
      expect(r.status).toBe(503);
      expect(r.body).toMatchObject({ error: { code: "system.database_unavailable" } });
    } finally {
      held.release();
    }
  });

  it("NFR-12 an unexpected failure answers 500 with system.unexpected, and the cause stays on the server", async () => {
    const r = await call(appOn(slowPool), "GET", "/probe/crash");
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ error: { code: "system.unexpected" } });
    expect(JSON.stringify(r.body)).not.toContain("secret detail");
  });
});
