import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withAccount, migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { admitAccount, ensureOperatorAccount, findOrCreateAccount } from "./index.ts";

// US-ACC-01, FR-ACC-01: account creation runs through its own path that sees only the account of the verified subject.
let pool: Pool;
// Deliberate cross-tenant observation/cleanup of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
const subjectA = `test-${randomUUID()}`;
const subjectB = `test-${randomUUID()}`;
const subjectOperator = `test-${randomUUID()}`;
// The subject is free text from a token (P-04, #1240): quotes, a backslash, injected SQL and `$1` must stay plain text.
const injected = `injected-${randomUUID()}`;
const subjectHostile = `hostile-${randomUUID()}'\\'); insert into account (subject) values ('${injected}'); drop table account; -- $1`;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [
    [subjectA, subjectB, subjectOperator, subjectHostile],
  ]);
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

describe("operator account of a batch (US-BES-12, #991)", () => {
  it("is found again and holds the operator role exactly once", async () => {
    const first = await ensureOperatorAccount(pool, subjectOperator);
    expect(await ensureOperatorAccount(pool, subjectOperator)).toBe(first);
    const roles = await admin.query("select role from account_role where account = $1", [first]);
    expect(roles.rows).toEqual([{ role: "operator" }]);
  });
});

/** A pool of its own whose `client.query` calls are recorded in the order sent (each connection is wrapped once). */
function recordingPool(): { pool: Pool; texts: string[] } {
  const probe = openOwnerPool();
  const texts: string[] = [];
  const wrapped = new WeakSet<object>();
  const connect = probe.connect.bind(probe) as () => Promise<PoolClient>;
  probe.connect = (async () => {
    const client = await connect();
    if (!wrapped.has(client)) {
      wrapped.add(client);
      const query = client.query.bind(client) as (...args: unknown[]) => unknown;
      client.query = ((...args: unknown[]) => {
        const sql = args[0];
        texts.push(typeof sql === "string" ? sql : String((sql as { text?: string }).text));
        return query(...args);
      }) as unknown as PoolClient["query"];
    }
    return client;
  }) as Pool["connect"];
  return { pool: probe, texts };
}

describe("NFR-12 one round trip to open the sign-in transaction (#1240)", () => {
  it("NFR-12 the sign-in path opens its transaction with one client.query call before the insert", async () => {
    const probe = recordingPool();
    try {
      await findOrCreateAccount(probe.pool, subjectA);
      expect(probe.texts[0]).toMatch(/^begin;/);
      expect(probe.texts[1]).toMatch(/^insert into account/);
    } finally {
      await probe.pool.end();
    }
  });
});

describe("P-04 the subject of the sign-in service is free text (#1240)", () => {
  it("P-04 stores a hostile subject as exactly its text, runs nothing else and finds only its own account", async () => {
    const id = await findOrCreateAccount(pool, subjectHostile);
    expect(await findOrCreateAccount(pool, subjectHostile)).toBe(id);
    expect(await admitAccount(pool, subjectHostile)).toBe(id);
    const stored = await admin.query<{ subject: string }>(
      "select subject from account where id = $1",
      [id],
    );
    expect(stored.rows).toEqual([{ subject: subjectHostile }]);
    const planted = await admin.query("select 1 from account where subject = $1", [injected]);
    expect(planted.rowCount).toBe(0);
    expect(await findOrCreateAccount(pool, subjectA)).not.toBe(id);
  });

  it("P-04 refuses a subject with a NUL byte and creates nothing", async () => {
    const prefix = `nul-${randomUUID()}`;
    await expect(
      findOrCreateAccount(pool, `${prefix}\u0000'); drop table account; --`),
    ).rejects.toThrow();
    const created = await admin.query("select 1 from account where subject like $1", [
      `${prefix}%`,
    ]);
    expect(created.rowCount).toBe(0);
  });
});
