import type { Pool, PoolClient } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `body` in a transaction as the application role for exactly one account (P-03, P-04).
 * The session variable holds only until the end of the transaction (`set_config(..., true)`), so it cannot
 * survive into a foreign request when the connection is reused.
 */
export async function withAccount<T>(
  pool: Pool,
  accountId: string,
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(accountId)) throw new Error("Account id is not a UUID");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    await client.query("select set_config('app.account_id', $1, true)", [accountId]);
    const result = await body(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
