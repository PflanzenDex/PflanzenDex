import type { Pool, PoolClient } from "pg";
import { withAccount } from "./tenant.ts";
import { tenantsTables, type TenantsTableName } from "./schema.ts";

/** What a fixture can create its prerequisites with: the ID of the account and its session (P-04). */
export interface FixtureContext {
  readonly accountId: string;
  readonly query: PoolClient;
}

/**
 * Example values per table for the columns except the account ID. If the table references another row of the account
 * (composite foreign key), the fixture creates it through the context and returns its ID.
 */
export type Fixtures = Record<
  string,
  (context: FixtureContext) => Record<string, unknown> | Promise<Record<string, unknown>>
>;

const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function insert(pool: Pool, t: TenantsTableName, accountId: string, fx: Fixtures) {
  await withAccount(pool, accountId, async (c) => {
    const values = { ...(await fx[t.name]?.({ accountId, query: c })), [t.id]: accountId };
    const columns = Object.keys(values);
    const sql = `insert into ${q(t.name)} (${columns.map(q).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`;
    await c.query(sql, Object.values(values));
  });
}

async function count(pool: Pool, t: TenantsTableName, accountId: string): Promise<number> {
  const r = await pool.query(`select count(*)::int as n from ${q(t.name)} where ${q(t.id)} = $1`, [
    accountId,
  ]);
  return r.rows[0].n;
}

async function clear(pool: Pool, tables: TenantsTableName[], accounts: string[]) {
  for (const t of [...tables].reverse())
    await pool.query(`delete from ${q(t.name)} where ${q(t.id)} = any($1)`, [accounts]);
}

/** As `attacker`, tries to read, change, delete or inject foreign rows of `victim`. */
async function attack(
  pool: Pool,
  t: TenantsTableName,
  attacker: string,
  victim: string,
): Promise<string[]> {
  const problems: string[] = [];
  const k = q(t.id);
  const read = await withAccount(pool, attacker, (c) => c.query(`select ${k} from ${q(t.name)}`));
  if (read.rows.some((z) => z[t.id] !== attacker)) problems.push("reads rows of a foreign account");
  const update = await withAccount(pool, attacker, (c) =>
    c.query(`update ${q(t.name)} set ${k} = ${k}`),
  );
  if (update.rowCount !== 1)
    problems.push(`changes ${update.rowCount} instead of only the own row`);
  const reassign = withAccount(pool, attacker, (c) =>
    c.query(`update ${q(t.name)} set ${k} = $1`, [victim]),
  );
  if (
    await reassign.then(
      () => true,
      () => false,
    )
  )
    problems.push("can attribute a row to a foreign account");
  const remove = await withAccount(pool, attacker, (c) => c.query(`delete from ${q(t.name)}`));
  if (remove.rowCount !== 1)
    problems.push(`deletes ${remove.rowCount} instead of only the own row`);
  if ((await count(pool, t, victim)) !== 1)
    problems.push("changed or deleted a row of the foreign account");
  return problems;
}

async function withoutAccount(pool: Pool, t: TenantsTableName): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role pflanzendex_app");
    const r = await client.query(`select 1 from ${q(t.name)}`);
    return r.rowCount === 0 ? [] : ["returns rows without an account in the session"];
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function checkTableName(
  pool: Pool,
  t: TenantsTableName,
  accounts: readonly [string, string],
  fx: Fixtures,
) {
  const [a, b] = accounts;
  if (!(t.name in fx))
    return ["no fixture in fixtures.ts: table is not included in the tenant test"];
  const problems: string[] = [];
  for (const [attacker, victim] of [
    [a, b],
    [b, a],
  ] as const) {
    await clear(pool, [t], [a, b]);
    await insert(pool, t, attacker, fx);
    await insert(pool, t, victim, fx);
    problems.push(...(await attack(pool, t, attacker, victim)));
    await clear(pool, [t], [a, b]);
  }
  await insert(pool, t, a, fx);
  problems.push(...(await withoutAccount(pool, t)));
  await clear(pool, [t], [a, b]);
  return problems;
}

async function createAccounts(pool: Pool, accounts: string[]) {
  for (const id of accounts)
    await withAccount(pool, id, (c) =>
      c.query("insert into account (id) values ($1) on conflict do nothing", [id]),
    );
}

/**
 * Generic tenant test (QG-D1, NFR-09): for every table with an account id, two accounts create one row each;
 * then account A may neither read, change, reassign nor delete B's row, and vice versa.
 * Returns the problems as text (empty means passed). The test accounts are removed again at the end.
 */
export async function checkTenantIsolation(
  pool: Pool,
  fixtures: Fixtures,
  accountA: string,
  accountB: string,
): Promise<string[]> {
  const tables = await tenantsTables(pool);
  // The account table last: deleting it pulls the rows of the others along via the foreign keys.
  const sortOrder = [
    ...tables.filter((t) => t.name !== "account"),
    ...tables.filter((t) => t.name === "account"),
  ];
  const problems: string[] = [];
  try {
    for (const t of sortOrder) {
      if (t.name !== "account") await createAccounts(pool, [accountA, accountB]);
      for (const p of await checkTableName(pool, t, [accountA, accountB], fixtures))
        problems.push(`${t.name}: ${p}`);
    }
  } finally {
    await pool.query("delete from account where id = any($1)", [[accountA, accountB]]);
  }
  return problems;
}
