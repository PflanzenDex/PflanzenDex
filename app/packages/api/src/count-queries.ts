import type { Pool, PoolClient } from "pg";

/** A pool that counts every SQL statement sent through it (US-QG-07). */
export type CountingPool = {
  /** Use this wherever the code under test expects a `Pool`. */
  pool: Pool;
  /** Statements since the last `reset`, including `begin`, `commit` and the account setup of `withAccount`. */
  count: () => number;
  reset: () => void;
};

/**
 * Wraps `pool` so that `pool.query` and `client.query` of every connection taken with `pool.connect()` are counted.
 * Nothing else changes: the statements still run on the real database. Counting at this level sees exactly what the
 * API sends, which is what grows in an N+1 (one extra round trip per row).
 */
export function countingPool(pool: Pool): CountingPool {
  let n = 0;
  const counted = <T extends Pool | PoolClient>(target: T): T =>
    new Proxy(target, {
      get(obj, prop) {
        const value = Reflect.get(obj, prop, obj) as unknown;
        if (prop === "query") {
          return (...args: unknown[]) => {
            n += 1;
            return (value as (...a: unknown[]) => unknown).apply(obj, args);
          };
        }
        if (prop === "connect" && typeof value === "function") {
          return async (...args: unknown[]) =>
            counted(await (value as (...a: unknown[]) => Promise<PoolClient>).apply(obj, args));
        }
        return typeof value === "function" ? value.bind(obj) : value;
      },
    });
  return {
    pool: counted(pool),
    count: () => n,
    reset: () => {
      n = 0;
    },
  };
}
