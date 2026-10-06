import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withAccount, migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { findOrCreateAccount } from "./index.ts";

// US-ACC-01, FR-ACC-01: account creation runs through its own path that sees only the account of the verified subject.
let pool: Pool;
// Deliberate cross-tenant observation/cleanup of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
const subjectA = `test-${randomUUID()}`;
const subjectB = `test-${randomUUID()}`;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subjectA, subjectB]]);
  await admin.end();
  await pool.end();
});

describe("account creation via the subject of the sign-in service (US-ACC-01)", () => {
  it("creates an account the first time and returns the same id afterwards", async () => {
    const first = await findOrCreateAccount(pool, subjectA);
    const second = await findOrCreateAccount(pool, subjectA);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it("two concurrent first sign-ins yield exactly one account", async () => {
    const ids = await Promise.all([1, 2, 3].map(() => findOrCreateAccount(pool, subjectB)));
    expect(new Set(ids).size).toBe(1);
    const n = await admin.query("select count(*)::int as n from account where subject = $1", [
      subjectB,
    ]);
    expect(n.rows[0].n).toBe(1);
  });

  it("different subjects get different accounts", async () => {
    const a = await findOrCreateAccount(pool, subjectA);
    const b = await findOrCreateAccount(pool, subjectB);
    expect(a).not.toBe(b);
  });

  it("an empty subject is rejected", async () => {
    await expect(findOrCreateAccount(pool, "")).rejects.toThrow(/Subject/);
  });

  it("the sign-in path never sees foreign accounts: without subject and without account the table is empty", async () => {
    await findOrCreateAccount(pool, subjectA);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pflanzendex_app");
      const r = await client.query("select id from account");
      expect(r.rowCount).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("account data (email, display name) is visible only to the own account (FR-ACC-01)", async () => {
    const a = await findOrCreateAccount(pool, subjectA);
    const b = await findOrCreateAccount(pool, subjectB);
    await withAccount(pool, a, (c) =>
      c.query(
        "insert into account_data (account_id, email, display_name) values ($1, 'a@example.test', 'A')",
        [a],
      ),
    );
    const viewB = await withAccount(pool, b, (c) => c.query("select * from account_data"));
    expect(viewB.rowCount).toBe(0);
  });
});
