import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import setup from "./test-global-setup.ts";
import { assignRole } from "./fixtures.ts";
import {
  migrate,
  openEnsuredOwnerPool,
  openFixturePool,
  openOwnerPool,
  withAccount,
} from "./kernel/index.ts";

// #294, QG-D1: the db suite must run like production, as a NON-superuser owner, so row-level security applies to
// every test. If the suite connection were a superuser again, RLS regressions would pass unnoticed.
let pool: pg.Pool;
let admin: pg.Pool;
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

describe("#294 QG-D1 the suite connection is a non-superuser owner", () => {
  it("#294 QG-D1 the default test connection is neither superuser nor BYPASSRLS", async () => {
    const r = await pool.query<{ s: boolean; b: boolean }>(
      "select rolsuper as s, rolbypassrls as b from pg_roles where rolname = current_user",
    );
    expect(r.rows[0]).toEqual({ s: false, b: false });
  });

  it("#294 QG-D1 the admin connection is the only superuser one (so the guard can tell them apart)", async () => {
    const r = await admin.query<{ s: boolean }>(
      "select rolsuper as s from pg_roles where rolname = current_user",
    );
    expect(r.rows[0]?.s).toBe(true);
  });

  it("#294 QG-D1 the suite connection owns the tables and row security is forced on them", async () => {
    const r = await pool.query<{ owner: boolean; forced: boolean }>(
      `select pg_has_role(current_user, c.relowner, 'usage') as owner, c.relforcerowsecurity as forced
       from pg_class c where c.relname = 'account'`,
    );
    expect(r.rows[0]).toEqual({ owner: true, forced: true });
  });

  it("#294 QG-D1 even the owner sees no row of a foreign account without an account context", async () => {
    // `idempotency` is an ordinary tenant table: without `withAccount` no `app.account_id` is set, forced row security hides
    // every row from the owner.
    for (const id of [a, b])
      await withAccount(pool, id, (c) =>
        c.query(
          "insert into idempotency (account_id, operation, key, fingerprint) values ($1, 'guard.guard', 'k', '{}')",
          [id],
        ),
      );
    const bare = await pool.query("select 1 from idempotency where account_id = any($1)", [[a, b]]);
    expect(bare.rowCount).toBe(0);
    const own = await withAccount(pool, a, (c) =>
      c.query<{ id: string }>(
        "select account_id as id from idempotency where account_id = any($1)",
        [[a, b]],
      ),
    );
    expect(own.rows.map((r) => r.id)).toEqual([a]);
  });

  it("#294 QG-D1 the operator overview counts every account although the owner is no superuser", async () => {
    const operator = randomUUID();
    await withAccount(pool, operator, (c) =>
      c.query("insert into account (id) values ($1)", [operator]),
    );
    await assignRole(pool, operator, "operator");
    const read = () =>
      withAccount(pool, operator, (c) =>
        c.query<{ n: number }>("select accounts as n from operator_overview(30)"),
      );
    const before = (await read()).rows[0]?.n ?? 0;
    expect(before).toBeGreaterThanOrEqual(3); // a, b and the operator, seen across tenants
    const seen = await withAccount(pool, operator, (c) => c.query("select 1 from account"));
    expect(seen.rowCount).toBe(1); // ...while the application role itself still sees only its own account
    await admin.query("delete from account where id = $1", [operator]);
  });
});

describe("#294 QG-D1 the bootstrap of the owner role", () => {
  it("#294 QG-D1 running the global setup again is harmless (idempotent, also for a second test process)", async () => {
    await expect(Promise.all([setup(), setup()])).resolves.toBeDefined();
    const r = await pool.query<{ s: boolean }>(
      "select rolsuper as s from pg_roles where rolname = current_user",
    );
    expect(r.rows[0]?.s).toBe(false);
  });
});

describe("#476 QG-D1 the owner pool for suites without a global setup", () => {
  it("#476 QG-D1 openEnsuredOwnerPool creates the owner database if needed and connects as the non-superuser", async () => {
    const own = await openEnsuredOwnerPool();
    try {
      const r = await own.query<{ s: boolean; b: boolean }>(
        "select rolsuper as s, rolbypassrls as b from pg_roles where rolname = current_user",
      );
      expect(r.rows[0]).toEqual({ s: false, b: false });
    } finally {
      await own.end();
    }
  });
});
