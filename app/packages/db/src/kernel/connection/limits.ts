import type { Pool } from "pg";

// Time limits of the database for the application (NFR-12, issue #1242). The values are starting values (assumptions):
// they bound how long a request may wait for the database, not what a legitimate operation needs; those run with
// LONG_LIMITS. 0 switches a limit off, as in PostgreSQL. A limit is set per transaction with `set_config(..., true)`,
// so it ends with the transaction and never reaches the next user of a pooled connection.

/** The limits of one transaction of the application role, in milliseconds. */
export interface DbLimits {
  /** Longest single statement (`statement_timeout`). */
  readonly statementMs: number;
  /** Longest wait for a lock (`lock_timeout`). */
  readonly lockMs: number;
  /** Longest pause inside a transaction before PostgreSQL ends it (`idle_in_transaction_session_timeout`). */
  readonly idleInTransactionMs: number;
}

/** Requests: a statement or a lock that takes longer answers with the stable code `system.database_unavailable`. */
export const REQUEST_LIMITS: DbLimits = {
  statementMs: 5000,
  lockMs: 3000,
  idleInTransactionMs: 30000,
};

/** Operations that legitimately run long (account export, account deletion, catalog load): a bounded budget, not none. */
export const LONG_LIMITS: DbLimits = {
  statementMs: 600000,
  lockMs: 30000,
  idleInTransactionMs: 600000,
};

/**
 * Connections of the production pool. Starting value (assumption), chosen from the concurrency measurement of #1242: the
 * smallest pool that reaches at least 90 % of the best measured throughput (`perf/load/concurrency.ts`).
 */
export const PRODUCTION_POOL_MAX = 12;

/** How a pool is opened in production (`poolConfigFromEnv`); tests keep the defaults of `openPool`. */
export interface PoolConfig {
  /** Connections the pool keeps open at most. */
  readonly max: number;
  /** Longest wait for a connection, in ms, while the pool is full or the server does not answer (0: no limit). */
  readonly connectionTimeoutMs: number;
  /** The limits of requests on this pool. */
  readonly limits: DbLimits;
}

const limitsOfPool = new WeakMap<Pool, DbLimits>();

/** Remembers the limits a pool was opened with, so that every transaction on it uses them. */
export function setPoolLimits(pool: Pool, limits: DbLimits): void {
  limitsOfPool.set(pool, limits);
}

/** The limits of requests on this pool; `REQUEST_LIMITS` for a pool that was not opened by `openPool`. */
export function poolLimits(pool: Pool): DbLimits {
  return limitsOfPool.get(pool) ?? REQUEST_LIMITS;
}

/**
 * Reads the production settings from the environment (`PFLANZENDEX_DB_*`, see docs/guides/operations/
 * staging-deploy-and-backup.md). An empty variable means the default; a value that is not a whole number stops the start.
 */
export function poolConfigFromEnv(env: Record<string, string | undefined>): PoolConfig {
  return {
    max: wholeNumber(env, "PFLANZENDEX_DB_POOL_MAX", PRODUCTION_POOL_MAX, 1),
    connectionTimeoutMs: wholeNumber(env, "PFLANZENDEX_DB_CONNECT_TIMEOUT_MS", 5000, 0),
    limits: {
      statementMs: wholeNumber(
        env,
        "PFLANZENDEX_DB_STATEMENT_TIMEOUT_MS",
        REQUEST_LIMITS.statementMs,
        0,
      ),
      lockMs: wholeNumber(env, "PFLANZENDEX_DB_LOCK_TIMEOUT_MS", REQUEST_LIMITS.lockMs, 0),
      idleInTransactionMs: wholeNumber(
        env,
        "PFLANZENDEX_DB_IDLE_TRANSACTION_TIMEOUT_MS",
        REQUEST_LIMITS.idleInTransactionMs,
        0,
      ),
    },
  };
}

function wholeNumber(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
): number {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min)
    throw new Error(`${name} must be a whole number of at least ${min} (got "${value}")`);
  return n;
}

// PostgreSQL error codes (appendix A) of "the database did not answer in time or is going away": 57014 statement
// timeout, 55P03 lock not available, 25P03 idle-in-transaction timeout, 57P01-57P03 shutdown or refused start, class 08
// connection exception.
const UNAVAILABLE_SQLSTATE = /^(57014|55P03|25P03|57P0[123]|08[0-9A-Z]{3})$/;
// Network errors of the driver without a SQLSTATE: the server refuses or does not answer.
const UNAVAILABLE_NETWORK = new Set(["ECONNREFUSED", "ETIMEDOUT"]);
// Messages that `pg` raises without a code: the pool gave up waiting for a connection, or the connection ended (also
// for a query sent after that).
const UNAVAILABLE_MESSAGES = [
  "timeout exceeded when trying to connect",
  "Connection terminated",
  "is not queryable",
];

/**
 * True when the error says that the database did not answer in time (statement, lock, idle transaction, wait for a
 * connection) or cannot be reached. The API answers such a failure with the stable code `system.database_unavailable`
 * (NFR-12, P-10); every other error stays a failure of the request itself.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (
    typeof code === "string" &&
    (UNAVAILABLE_SQLSTATE.test(code) || UNAVAILABLE_NETWORK.has(code))
  )
    return true;
  return typeof message === "string" && UNAVAILABLE_MESSAGES.some((m) => message.includes(m));
}
