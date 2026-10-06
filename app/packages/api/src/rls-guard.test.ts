import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool, withAccount } from "@pflanzendex/db";

// QG-D1 (#476): the api suite must run like production, as a NON-superuser owner, so row-level security applies to
// every route test. If the suite connection were a superuser again, an RLS regression visible only through the
// HTTP layer would pass unnoticed.
let pool: Pool;
let admin: Pool;
const [a, b] = [randomUUID(), randomUUID()];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  for (const id of [a, b])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[a, b]]);
  await pool.end();
  await admin.end();
});

describe("QG-D1 the api suite connection is a non-superuser owner", () => {
  it("QG-D1 the api test connection is neither superuser nor BYPASSRLS", async () => {
    const r = await pool.query<{ s: boolean; b: boolean }>(
      "select rolsuper as s, rolbypassrls as b from pg_roles where rolname = current_user",
    );
    expect(r.rows[0]).toEqual({ s: false, b: false });
  });

  it("QG-D1 a bare query on the suite connection sees no tenant row, the fixture pool does", async () => {
    // Without `withAccount` forced row security hides every row from the owner: a bare delete or select would be a
    // silent no-op, so tests must use the fixture pool for setup, cleanup and cross-tenant observation.
    for (const id of [a, b])
      await withAccount(pool, id, (c) =>
        c.query(
          "insert into idempotency (account_id, operation, key, fingerprint) values ($1, 'guard.guard', 'k', '{}')",
          [id],
        ),
      );
    const bare = await pool.query("select 1 from idempotency where account_id = any($1)", [[a, b]]);
    expect(bare.rowCount).toBe(0);
    const seen = await admin.query("select 1 from idempotency where account_id = any($1)", [
      [a, b],
    ]);
    expect(seen.rowCount).toBe(2);
  });
});
