import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryObjectStore, runNext } from "@pflanzendex/core";
import { JobsPostgres, migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";
import { deleteAccountHandlers } from "./deletion-routes";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-ACC-04: deleting the own account through the API and the background job (real PostgreSQL, in-memory object store).
let pool: Pool;
let admin: Pool;
const subA = `acc4d-${randomUUID()}`;
const subB = `acc4d-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const store = new InMemoryObjectStore();
let app: ReturnType<typeof createApp>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Json };
}
const idOf = async (sub: string) =>
  (await admin.query("select id from account where subject = $1", [sub])).rows[0]?.id as
    string | undefined;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, media: { store, processor: {} as never } });
  await call(subA, "GET", "/account");
  await call(subB, "GET", "/account");
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.query("delete from job where type = 'privacy.delete_account'");
  await admin.end();
  await pool.end();
});

describe("US-ACC-04 deleting the account through the API", () => {
  it("US-ACC-04 refuses without sign-in and without an explicit confirmation", async () => {
    expect((await call(null, "POST", "/account/deletion", { confirm: true })).status).toBe(401);
    expect((await call(subA, "POST", "/account/deletion", {})).status).toBe(400);
    expect((await call(subA, "GET", "/account/deletion")).body).toEqual({ requested: false });
  });

  it("US-ACC-04 requests the deletion with a deadline in 7 days, which the keeper can see and withdraw", async () => {
    const asked = await call(subA, "POST", "/account/deletion", { confirm: true });
    expect(asked.status).toBe(200);
    const days =
      (Date.parse(asked.body["dueAt"]) - Date.parse(asked.body["requestedAt"])) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    expect((await call(subA, "GET", "/account/deletion")).body).toMatchObject({ requested: true });
    expect((await call(subB, "GET", "/account/deletion")).body).toEqual({ requested: false });
    expect((await call(subA, "DELETE", "/account/deletion")).body).toEqual({ requested: false });
    expect((await call(subA, "GET", "/account/deletion")).body).toEqual({ requested: false });
  });

  it("US-ACC-04 the job removes the account, its photos and its data once the grace period is over, and only then", async () => {
    const id = (await idOf(subA)) as string;
    await store.put(id, "photo-1.jpg", new Uint8Array([1]), "image/jpeg");
    await store.put(randomUUID(), "foreign.jpg", new Uint8Array([2]), "image/jpeg");
    await call(subA, "POST", "/account/deletion", { confirm: true });
    const run = (now: Date) =>
      runNext({
        queue: new JobsPostgres(pool),
        handlers: deleteAccountHandlers(pool, store),
        now: () => now,
        workerId: "test",
      });
    // Before the deadline the job is not even handed out.
    expect((await run(new Date())).kind).toBe("idle");
    await admin.query(
      `update account_deletion set requested_at = now() - interval '8 days', due_at = now() - interval '1 day'
        where account_id = $1`,
      [id],
    );
    expect((await run(new Date(Date.now() + 8 * 86_400_000))).kind).toBe("succeeded");
    expect(await idOf(subA)).toBeUndefined();
    expect(
      (await admin.query("select 1 from account_data where account_id = $1", [id])).rowCount,
    ).toBe(0);
    expect(store.objectCount()).toBe(1);
    expect(await idOf(subB)).toBeDefined();
    const log = await admin.query("select subject from deletion_log where subject = $1", [subA]);
    expect(log.rowCount).toBe(1); // the identity is removed at the sign-in service by the operator
  });
});
