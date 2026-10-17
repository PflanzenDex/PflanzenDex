import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findSchemaViolations } from "../schema-check.ts";
import {
  withAccount,
  asAccount,
  migrate,
  checkTenantIsolation,
  openOwnerPool,
  openFixturePool,
} from "./index.ts";
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
