import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPool, testOwnerUrl } from "../connection/connection.ts";
import { withAccount, withLongAccount } from "../tenant.ts";
import {
  isDatabaseUnavailable,
  PRODUCTION_POOL_MAX,
  poolConfigFromEnv,
  REQUEST_LIMITS,
} from "./limits.ts";

// NFR-12 (#1242): time limits of the application role and the wait for a connection, in real PostgreSQL (`make db-up`).
const ACCOUNT = randomUUID(); // `withAccount` needs an account id, not an existing account for these statements

describe("NFR-12 environment settings of the pool", () => {
  it("NFR-12 the defaults are the production starting values", () => {
    expect(poolConfigFromEnv({})).toEqual({
      max: PRODUCTION_POOL_MAX,
      connectionTimeoutMs: 5000,
      limits: REQUEST_LIMITS,
    });
  });

  it("NFR-12 a value overrides its default, an empty value keeps it, 0 switches a limit off", () => {
    expect(
      poolConfigFromEnv({
        PFLANZENDEX_DB_POOL_MAX: "8",
        PFLANZENDEX_DB_CONNECT_TIMEOUT_MS: "",
        PFLANZENDEX_DB_STATEMENT_TIMEOUT_MS: "0",
        PFLANZENDEX_DB_IDLE_TRANSACTION_TIMEOUT_MS: "45000",
      }),
    ).toEqual({
      max: 8,
      connectionTimeoutMs: 5000,
      limits: { statementMs: 0, lockMs: 3000, idleInTransactionMs: 45000 },
    });
  });

  it("NFR-12 a value that is not a whole number stops the start and names the variable", () => {
    expect(() => poolConfigFromEnv({ PFLANZENDEX_DB_POOL_MAX: "0" })).toThrow(
      'PFLANZENDEX_DB_POOL_MAX must be a whole number of at least 1 (got "0")',
    );
    expect(() => poolConfigFromEnv({ PFLANZENDEX_DB_LOCK_TIMEOUT_MS: "3s" })).toThrow(
      "PFLANZENDEX_DB_LOCK_TIMEOUT_MS",
    );
  });
});

describe("NFR-12 classification of database failures", () => {
  it.each([
    ["57014", "statement timeout"],
    ["55P03", "lock timeout"],
    ["25P03", "idle transaction timeout"],
    ["57P01", "admin shutdown"],
    ["08006", "connection failure"],
  ])("NFR-12 SQLSTATE %s (%s) is unavailable", (code) => {
    expect(isDatabaseUnavailable(Object.assign(new Error("x"), { code }))).toBe(true);
  });

  it("NFR-12 a refused connection and the pool's wait timeout are unavailable", () => {
    expect(
      isDatabaseUnavailable(Object.assign(new Error("connect"), { code: "ECONNREFUSED" })),
    ).toBe(true);
    expect(isDatabaseUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(true);
  });

  it("NFR-12 a constraint violation, a syntax error and a plain error are not unavailable", () => {
    expect(isDatabaseUnavailable(Object.assign(new Error("dup"), { code: "23505" }))).toBe(false);
    expect(isDatabaseUnavailable(Object.assign(new Error("syntax"), { code: "42601" }))).toBe(
      false,
    );
    expect(isDatabaseUnavailable(new Error("boom"))).toBe(false);
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable("57014")).toBe(false);
  });
});

describe("NFR-12 limits in PostgreSQL", () => {
  let pool: Pool;
  beforeAll(() => {
    pool = openPool(testOwnerUrl(), false, {
      limits: { statementMs: 200, lockMs: 3000, idleInTransactionMs: 300 },
    });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("NFR-12 a statement longer than statement_timeout fails with 57014, and the limit ends with the transaction", async () => {
    const before = (await pool.query<{ v: string }>("show statement_timeout")).rows[0]?.v;
    const error = await withAccount(pool, ACCOUNT, (c) => c.query("select pg_sleep(1)")).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ code: "57014" });
    expect(isDatabaseUnavailable(error)).toBe(true);
    const after = (await pool.query<{ v: string }>("show statement_timeout")).rows[0]?.v;
    expect(after).toBe(before);
  });

  it("NFR-12 a statement within the limit succeeds as the application role", async () => {
    const r = await withAccount(pool, ACCOUNT, (c) =>
      c.query<{ role: string }>("select current_user as role"),
    );
    expect(r.rows[0]?.role).toBe("pflanzendex_app");
  });

  it("NFR-12 a pause inside a transaction longer than idle_in_transaction_session_timeout ends it, and the error is unavailable", async () => {
    const error = await withAccount(pool, ACCOUNT, async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return c.query("select 1");
    }).catch((e: unknown) => e);
    expect(isDatabaseUnavailable(error)).toBe(true);
  });

  it("NFR-12 a wait for a free connection ends at the connection timeout with the stable classification", async () => {
    const small = openPool(testOwnerUrl(), false, { max: 1, connectionTimeoutMs: 200 });
    const held = await small.connect();
    try {
      const started = Date.now();
      const error = await withAccount(small, ACCOUNT, async () => "unreached").catch(
        (e: unknown) => e,
      );
      expect(Date.now() - started).toBeLessThan(2000);
      expect(error).toBeInstanceOf(Error);
      expect(isDatabaseUnavailable(error)).toBe(true);
    } finally {
      held.release();
      await small.end();
    }
  });

  it("NFR-12 the long operations keep a bounded budget that a request would not get", async () => {
    const slow = "select pg_sleep(0.5) as done";
    expect(
      await withAccount(pool, ACCOUNT, (c) => c.query(slow)).catch((e: unknown) => e),
    ).toMatchObject({
      code: "57014",
    });
    const r = await withLongAccount(pool, ACCOUNT, (c) => c.query<{ done: string }>(slow));
    expect(r.rowCount).toBe(1);
  });

  it("NFR-12 a pool keeps a listener for connection errors, so a dropped idle connection cannot end the process", () => {
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });
});
