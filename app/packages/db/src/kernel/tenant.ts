import type { Pool, PoolClient } from "pg";
import { LONG_LIMITS, poolLimits, type DbLimits } from "./connection/limits.ts";
import { inTransaction } from "./connection/transaction.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Settings = readonly (readonly [name: string, value: string])[];

/** The session variables of a transaction, then its three time limits (NFR-12), in the order they are set. */
function settingsOf(limits: DbLimits, variables: Settings): Settings {
  return [
    ...variables,
    ["statement_timeout", String(limits.statementMs)],
    ["lock_timeout", String(limits.lockMs)],
    ["idle_in_transaction_session_timeout", String(limits.idleInTransactionMs)],
  ];
}

/**
 * Switches the open transaction to the application role (row rules apply, P-04) and sets its session variables and its
 * time limits (NFR-12). For a caller that opens the transaction with its own `begin` and runs something before the
 * switch (the catalog load, after its advisory lock): the role is one statement and the settings one `set_config(..., true)`
 * select. A caller that switches right after `begin` uses `beginAsApplicationRole`, which needs one round trip. They end
 * with the transaction.
 */
export async function enterApplicationRole(
  client: PoolClient,
  limits: DbLimits,
  variables: Settings,
): Promise<void> {
  await client.query("set local role pflanzendex_app");
  const settings = settingsOf(limits, variables);
  const calls = settings.map((_, i) => `set_config($${2 * i + 1}, $${2 * i + 2}, true)`);
  await client.query(`select ${calls.join(", ")}`, settings.flat());
}

/**
 * Opens a transaction as the application role in one round trip (NFR-12, #1240): `begin`, the role switch and the
 * settings of `enterApplicationRole` go in one simple-protocol query, so the frame of a request opens with one statement
 * instead of three. The settings are `set_config(..., true)` and end with the transaction. The simple protocol takes no
 * parameters, so every value is written into the text with `client.escapeLiteral`, the setting names and the limits too.
 * The caller checks an account id as a UUID; a sign-in subject is free text from a token and relies on this escaping.
 */
export async function beginAsApplicationRole(
  client: PoolClient,
  limits: DbLimits,
  variables: Settings,
): Promise<void> {
  const calls = settingsOf(limits, variables).map(
    ([name, value]) =>
      `set_config(${client.escapeLiteral(name)}, ${client.escapeLiteral(value)}, true)`,
  );
  await client.query(`begin; set local role pflanzendex_app; select ${calls.join(", ")}`);
}

/**
 * Runs `body` in a transaction as the application role for exactly one account (P-03, P-04), with the limits of the
 * pool (`REQUEST_LIMITS` unless the pool was opened otherwise). The session variable holds only until the end of the
 * transaction (`set_config(..., true)`), so it cannot survive into a foreign request when the connection is reused.
 */
export async function withAccount<T>(
  pool: Pool,
  accountId: string,
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inAccount(pool, accountId, poolLimits(pool), body);
}

/**
 * As `withAccount`, with the limits of long operations (`LONG_LIMITS`): the account export and the account deletion
 * (NFR-12). They keep a bounded budget instead of none.
 */
export async function withLongAccount<T>(
  pool: Pool,
  accountId: string,
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inAccount(pool, accountId, LONG_LIMITS, body);
}

async function inAccount<T>(
  pool: Pool,
  accountId: string,
  limits: DbLimits,
  body: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(accountId)) throw new Error("Account id is not a UUID");
  return inTransaction(
    pool,
    (client) => beginAsApplicationRole(client, limits, [["app.account_id", accountId]]),
    body,
  );
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
  await client.query("select set_config('app.account_id', $1, true)", [
    (before.rows[0] as { id: string }).id,
  ]);
  return result;
}
