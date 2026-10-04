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

/**
 * Runs `body` as another account inside the transaction of `client` and restores the caller's account afterwards.
 * Only for operations that fold the data of one account into the catalog on behalf of a reviewer (merge of a proposal,
 * US-BES-10): the creator's rows can only be re-pointed under the creator's row rule, in the same transaction as the
 * review decision. The caller must already have proven the right to do so (the review case update is guarded by
 * the reviewer role in the database).
 */
export async function asAccount<T>(
  client: PoolClient,
  accountId: string,
  body: () => Promise<T>,
): Promise<T> {
  if (!UUID.test(accountId)) throw new Error("Account id is not a UUID");
  const before = await client.query<{ id: string }>(
    "select current_setting('app.account_id', true) as id",
  );
  await client.query("select set_config('app.account_id', $1, true)", [accountId]);
  // No `finally`: after an error the transaction is aborted and rolled back by the caller; a restore query would
  // only hide the original error.
  const result = await body();
  await client.query("select set_config('app.account_id', $1, true)", [before.rows[0]?.id ?? ""]);
  return result;
}
