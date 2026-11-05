import type { Pool, PoolClient } from "pg";

/** What a unit of work answers when it decides itself how its transaction ends. */
export interface Settled<T> {
  readonly commit: boolean;
  readonly value: T;
}

/** Opens a transaction: plain `begin`, or `beginAsApplicationRole` with its settings. */
type Open = (client: PoolClient) => Promise<unknown>;

/** Opens a transaction as the role of the connection, for the paths that run as the schema owner (jobs, catalog). */
export const beginPlain: Open = (client) => client.query("begin");

/**
 * The one frame of a transaction (NFR-12, P-04, P-10, #1314): takes a connection, opens, runs `work`, commits or rolls
 * back as `work` decides, releases. If `open` or `work` fails, it rolls back and rethrows that error. A rollback that
 * fails (the connection is gone) never replaces the answer or the error: the server ends the transaction with the
 * connection, and the connection is dropped instead of going back to the pool with an open transaction and its session
 * variables.
 */
export async function settleTransaction<T>(
  pool: Pool,
  open: Open,
  work: (client: PoolClient) => Promise<Settled<T>>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  const rollback = () =>
    client.query("rollback").then(
      () => undefined,
      (e: unknown) => {
        broken = e instanceof Error ? e : new Error(String(e));
      },
    );
  try {
    await open(client);
    const { commit, value } = await work(client);
    if (commit) await client.query("commit");
    else await rollback();
    return value;
  } catch (error) {
    await rollback();
    throw error;
  } finally {
    client.release(broken);
  }
}

/** As `settleTransaction`, for work that always commits when it returns. */
export function inTransaction<T>(
  pool: Pool,
  open: Open,
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return settleTransaction(pool, open, async (client) => ({
    commit: true,
    value: await body(client),
  }));
}
