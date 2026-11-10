import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findSchemaViolations } from "../schema-check.ts";
import {
  withAccount,
  asAccount,
  beginAsApplicationRole,
  migrate,
  checkTenantIsolation,
  openOwnerPool,
  openFixturePool,
  openPool,
  REQUEST_LIMITS,
  testOwnerUrl,
} from "./index.ts";
import { setPoolLimits } from "./connection/limits.ts";
import { FIXTURES, createFixtureSpeciesAt } from "../fixtures.ts";
import { MODULE_CONFIG as REGISTER } from "../../../../config/lint/modules.config.mjs";

// Test harness with two accounts (QG-D1, NFR-09, FR-ACC-02). Runs against a real PostgreSQL (`make db-up`).
let pool: Pool;
// Deliberate cross-tenant cleanup/observation of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
const accountA = randomUUID();
const accountB = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  await createFixtureSpeciesAt();
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[accountA, accountB]]);
  await admin.end();
  await pool.end();
});

describe("US-BES-10 switching the account inside a transaction (merge of a proposal)", () => {
  it("US-BES-10 runs as the other account and restores the caller's account afterwards", async () => {
    const seen = await withAccount(pool, accountA, async (c) => {
      const current = () =>
        c
          .query<{ id: string }>("select current_setting('app.account_id') as id")
          .then((r) => r.rows[0]?.id);
      const inside = await asAccount(c, accountB, current);
      return { inside, after: await current() };
    });
    expect(seen).toEqual({ inside: accountB, after: accountA });
  });

  it("US-BES-10 refuses an account id that is not a UUID", async () => {
    await expect(
      withAccount(pool, accountA, (c) => asAccount(c, "not-a-uuid", async () => 1)),
    ).rejects.toThrow("Account id is not a UUID");
  });
});

describe("tenant isolation across all tables", () => {
  it("account A reads and changes nothing of account B (and vice versa), for every table with an account id", async () => {
    const problems = await checkTenantIsolation(pool, FIXTURES, [accountA, accountB], admin);
    expect(problems).toEqual([]);
  });

  it("the schema has no table without account id and none without enforced row rule", async () => {
    expect(await findSchemaViolations(pool)).toEqual([]);
  });

  it("every table belongs to a module, no foreign key violates the module boundaries (AB-10, AB-13)", async () => {
    expect(await findSchemaViolations(pool, REGISTER)).toEqual([]);
  });

  it("a new table without account id stands out", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create table vergessen (id serial primary key, name text)");
      const violations = await findSchemaViolations(client);
      expect(violations).toEqual([expect.stringContaining("vergessen")]);
      expect(violations[0]).toContain("account id");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("a table with account id but without row rule stands out", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create table open (account_id uuid not null references account(id))");
      const violations = await findSchemaViolations(client);
      expect(violations).toEqual([expect.stringContaining("open")]);
      expect(violations[0]).toContain("row rule");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("a protected table without fixture makes the generic test fail", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("create table fresh (account_id uuid not null references account(id))");
      await client.query("select tenant_protection('fresh')");
      await client.query("commit");
      const problems = await checkTenantIsolation(pool, FIXTURES, [accountA, accountB], admin);
      expect(problems).toEqual([expect.stringContaining("fresh")]);
    } finally {
      client.release();
      await pool.query("drop table if exists fresh");
    }
  });

  it("a broken protection is detected by the generic test (rule allows foreign access)", async () => {
    await pool.query(
      "create table leak (account_id uuid not null references account(id), value text)",
    );
    try {
      await pool.query("select tenant_protection('leak')");
      await pool.query("drop policy tenant on leak");
      await pool.query("create policy tenant on leak using (true) with check (true)");
      const fixtures = { ...FIXTURES, leak: () => ({ value: "x" }) };
      const problems = await checkTenantIsolation(pool, fixtures, [accountA, accountB], admin);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join("\n")).toContain("leak");
    } finally {
      await pool.query("drop table leak");
    }
  });
});

describe("session variable per transaction", () => {
  it("without an account in the session the application sees nothing (safe default)", async () => {
    await withAccount(pool, accountA, (c) =>
      c.query("insert into account (id) values ($1)", [accountA]),
    );
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pflanzendex_app");
      const r = await client.query("select * from account");
      expect(r.rowCount).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("the variable holds only within the transaction and does not leak into the next (pool reuse)", async () => {
    await withAccount(pool, accountA, (c) => c.query("select 1"));
    const client = await pool.connect();
    try {
      const r = await client.query("select current_setting('app.account_id', true) as k");
      expect(r.rows[0].k ?? "").toBe("");
      const role = await client.query("select current_user as u");
      expect(role.rows[0].u).not.toBe("pflanzendex_app");
    } finally {
      client.release();
    }
  });

  it("rejects an account id that is not a UUID (no injection)", async () => {
    await expect(withAccount(pool, "x'; drop table account;--", async () => 1)).rejects.toThrow(
      /UUID/,
    );
  });

  it("on an error in the body it rolls back", async () => {
    await expect(
      withAccount(pool, accountB, async (c) => {
        await c.query("insert into account (id) values ($1)", [accountB]);
        throw new Error("Abbruch");
      }),
    ).rejects.toThrow("Abbruch");
    const r = await admin.query("select 1 from account where id = $1", [accountB]);
    expect(r.rowCount).toBe(0);
  });
});

// The session as a transaction of the application role sees it (NFR-12): the role, the account and the three limits,
// with the backend pid to show which pooled connection answered. An unset account reads as NULL before a transaction
// and as '' after one; both mean "no account", so the query reads them alike.
const SESSION_SQL = `select pg_backend_pid() as pid, current_user as user_name,
  coalesce(current_setting('app.account_id', true), '') as account,
  current_setting('statement_timeout') as "statementTimeout",
  current_setting('lock_timeout') as "lockTimeout",
  current_setting('idle_in_transaction_session_timeout') as "idleInTransactionTimeout"`;
type Session = {
  pid: number;
  user_name: string;
  account: string;
  statementTimeout: string;
  lockTimeout: string;
  idleInTransactionTimeout: string;
};
const sessionOf = async (c: PoolClient): Promise<Session> =>
  (await c.query<Session>(SESSION_SQL)).rows[0] as Session;
/** The session of one connection of `pool` outside any transaction; the connection goes back in any case. */
async function sessionOutside(pool: Pool): Promise<Session> {
  const c = await pool.connect();
  try {
    return await sessionOf(c);
  } finally {
    c.release();
  }
}
const APPLICATION_SESSION = {
  user_name: "pflanzendex_app",
  statementTimeout: "5s",
  lockTimeout: "3s",
  idleInTransactionTimeout: "30s",
};

/** A pool of its own whose `client.query` calls are recorded in the order sent (each connection is wrapped once). */
function recordingPool(): { pool: Pool; texts: string[] } {
  const pool = openOwnerPool();
  const texts: string[] = [];
  const wrapped = new WeakSet<object>();
  const connect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  pool.connect = (async () => {
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
  return { pool, texts };
}

describe("NFR-12 one round trip to open a transaction (#1240)", () => {
  it("NFR-12 a transaction opens with exactly one client.query call before the body", async () => {
    const probe = recordingPool();
    try {
      const before = await withAccount(probe.pool, accountA, async () => [...probe.texts]);
      expect(before).toHaveLength(1);
      expect(before[0]).toMatch(/^begin;/);
      expect(before[0]).toContain("set local role pflanzendex_app");
    } finally {
      await probe.pool.end();
    }
  });

  it("NFR-12 the transaction runs as the application role for the account, with the three limits of the pool", async () => {
    const seen = await withAccount(pool, accountA, sessionOf);
    expect(seen).toMatchObject({ ...APPLICATION_SESSION, account: accountA });
  });

  it("NFR-12 beginAsApplicationRole sets the same session as the three-statement opening", async () => {
    const client = await pool.connect();
    try {
      await beginAsApplicationRole(client, REQUEST_LIMITS, [["app.account_id", accountA]]);
      expect(await sessionOf(client)).toMatchObject({ ...APPLICATION_SESSION, account: accountA });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("NFR-12 the settings end with the transaction: after commit and after rollback the next user of the connection sees the session as before (P-04)", async () => {
    // One connection only: the next checkout is the same backend (pid), as in production after a request.
    const probe = openPool(testOwnerUrl(), false, { max: 1 });
    try {
      const before = await sessionOutside(probe);
      expect(await withAccount(probe, accountA, sessionOf)).toMatchObject({ account: accountA });
      const afterCommit = await sessionOutside(probe);
      await expect(
        withAccount(probe, accountA, async (c) => {
          await sessionOf(c);
          throw new Error("Abbruch");
        }),
      ).rejects.toThrow("Abbruch");
      const afterRollback = await sessionOutside(probe);
      expect({ afterCommit, afterRollback }).toEqual({
        afterCommit: before,
        afterRollback: before,
      });
    } finally {
      await probe.end();
    }
  });

  it("P-04 keeps a value with quotes, a backslash, injected SQL and $1 as exactly that text, and runs nothing else", async () => {
    const hostile = "it's \\ '; drop table account; -- $1";
    const client = await pool.connect();
    try {
      await beginAsApplicationRole(client, REQUEST_LIMITS, [["app.subject", hostile]]);
      const r = await client.query<{ v: string }>("select current_setting('app.subject') as v");
      expect(r.rows[0]?.v).toBe(hostile);
      const table = await client.query("select 1 from pg_class where relname = 'account'");
      expect(table.rowCount).toBe(1);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("P-04 refuses a setting name that tries to end the statement, and runs nothing else", async () => {
    const client = await pool.connect();
    try {
      await expect(
        beginAsApplicationRole(client, REQUEST_LIMITS, [["app.x'); drop table account; --", "1"]]),
      ).rejects.toThrow(/parameter name/);
      await client.query("rollback");
      const table = await client.query("select 1 from pg_class where relname = 'account'");
      expect(table.rowCount).toBe(1);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("NFR-12 a failing opening call reaches the caller, is rolled back, and the next withAccount on that pool works (P-04)", async () => {
    const probe = openPool(testOwnerUrl(), false, {
      max: 1,
      limits: { ...REQUEST_LIMITS, statementMs: -1 },
    });
    try {
      await expect(withAccount(probe, accountA, async () => "unreached")).rejects.toThrow(
        /statement_timeout/,
      );
      const leftover = await sessionOutside(probe);
      expect(leftover.user_name).not.toBe("pflanzendex_app");
      expect(leftover.account).toBe("");
      setPoolLimits(probe, REQUEST_LIMITS);
      expect(await withAccount(probe, accountA, sessionOf)).toMatchObject({
        ...APPLICATION_SESSION,
        account: accountA,
      });
    } finally {
      await probe.end();
    }
  });
});
