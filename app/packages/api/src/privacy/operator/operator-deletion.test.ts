import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-ACC-04 (issue 1673): the operator's view of the open deletions and the marking of an identity removal, through the
// API (real PostgreSQL). Only the operator role may use them; the error shape is the one of the API.
let pool: Pool;
let admin: Pool;
const operator = `acc4op-${randomUUID()}`;
const keeper = `acc4kp-${randomUUID()}`;
const subject = `acc4id-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
let entry: string;
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

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  await call(operator, "GET", "/account");
  await call(keeper, "GET", "/account");
  await admin.query(
    `insert into account_role (account, role) select id, 'operator' from account where subject = $1`,
    [operator],
  );
  const r = await pool.query<{ id: string }>(
    `insert into deletion_log (requested_at, completed_at, subject)
     values (now() - interval '2 days', now() - interval '1 day', $1) returning id`,
    [subject],
  );
  entry = r.rows[0]?.id as string;
});
afterAll(async () => {
  await admin.query("delete from deletion_log where subject = $1", [subject]);
  await admin.query("delete from account where subject = any($1)", [[operator, keeper]]);
  await admin.end();
  await pool.end();
});

describe("US-ACC-04 the operator's deadline view", () => {
  it("US-ACC-04 refuses without sign-in, and a plant keeper gets access.denied in the error shape", async () => {
    expect((await call(null, "GET", "/operator/deletions")).status).toBe(401);
    const denied = await call(keeper, "GET", "/operator/deletions");
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({
      error: { code: "access.denied", text: expect.any(String) },
    });
  });

  it("US-ACC-04 the operator reads the open identity removals with their subject, and no account", async () => {
    const r = await call(operator, "GET", "/operator/deletions");
    expect(r.status).toBe(200);
    expect(r.body.identityRemovals).toContainEqual(
      expect.objectContaining({
        kind: "identity",
        entryId: entry,
        subject,
        deadline: expect.any(String),
      }),
    );
    expect(r.body.warningDays).toBe(7);
    expect(JSON.stringify(r.body)).not.toMatch(/accountId|account_id/);
  });

  it("US-ACC-04 marking a removal done by hand closes it; a repeat answers success, an unknown entry 404", async () => {
    expect(
      (await call(keeper, "POST", `/operator/deletion-log/${entry}/identity-removed`)).status,
    ).toBe(403);
    const first = await call(operator, "POST", `/operator/deletion-log/${entry}/identity-removed`);
    expect(first).toMatchObject({ status: 200, body: { entryId: entry, outcome: "marked" } });
    const second = await call(operator, "POST", `/operator/deletion-log/${entry}/identity-removed`);
    expect(second).toMatchObject({ status: 200, body: { outcome: "already" } });
    const unknown = await call(
      operator,
      "POST",
      `/operator/deletion-log/${randomUUID()}/identity-removed`,
    );
    expect(unknown).toMatchObject({
      status: 404,
      body: { error: { code: "privacy.entry_not_found" } },
    });
    const bad = await call(operator, "POST", "/operator/deletion-log/not-an-id/identity-removed");
    expect(bad).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    const after = await call(operator, "GET", "/operator/deletions");
    expect(after.body.identityRemovals).not.toContainEqual(
      expect.objectContaining({ entryId: entry }),
    );
  });
});
