import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

export const MIGRATIONS_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
);
export const MIGRATIONS_TABLE_NAME = "schema_migrations";
/** Lock timeout of every migration (US-DEV-07): a migration that waits longer for a lock fails and is rolled back. A file may set its own. */
export const MIGRATION_LOCK_TIMEOUT_MS = 5000;

export type MigrationsOptions = { directory?: string; tableName?: string; lockTimeoutMs?: number };

const checksum = (content: string) => createHash("sha256").update(content).digest("hex");

/**
 * Applies not yet applied `*.sql` files in name order, each in its own transaction (US-DEV-07).
 * Forward only: an already applied file must never change (checksum). Returns the newly applied names.
 * An advisory lock prevents two processes from migrating at the same time. Every file runs with a lock timeout
 * (`MIGRATION_LOCK_TIMEOUT_MS`) unless it sets its own. A file whose first lines hold `-- migrate: no-transaction` runs
 * statement by statement without a transaction (for `create index concurrently`); see `apply`.
 */
export async function migrate(pool: Pool, options: MigrationsOptions = {}): Promise<string[]> {
  const directory = options.directory ?? MIGRATIONS_DIRECTORY;
  const tableName = options.tableName ?? MIGRATIONS_TABLE_NAME;
  const lockTimeoutMs = options.lockTimeoutMs ?? MIGRATION_LOCK_TIMEOUT_MS;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory comes from a constant or the caller, never from user input
  const files = readdirSync(directory)
    .filter((d) => d.endsWith(".sql"))
    .sort();
  // The migrations run on a connection of their own, which is closed at the end: a `set` in a file stays on the session,
  // and that session must not go back to the pool (US-DEV-07).
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [tableName]);
    await client.query(
      `create table if not exists ${tableName} (name text primary key, checksum text not null, applied_at timestamptz not null default now())`,
    );
    // Databases created before the English rename (ADR 0004) carry the German column names: rename them once.
    await client.query(
      `do $$ begin
         if exists (select from information_schema.columns where table_name = '${tableName}' and column_name = 'pruefsumme') then
           alter table ${tableName} rename column pruefsumme to checksum;
           alter table ${tableName} rename column angewendet_am to applied_at;
         end if;
       end $$`,
    );
    const known = await loadKnown(client, tableName);
    for (const name of files) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- file name from the directory listing above
      const content = readFileSync(join(directory, name), "utf8");
      const alt = known.get(name);
      if (alt === undefined) {
        await apply(client, { tableName, name, content, lockTimeoutMs }).catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Migration ${name} failed: ${reason}`, { cause: error });
        });
        applied.push(name);
      } else if (alt !== checksum(content)) {
        throw new Error(`Migration ${name} was changed after it was applied`);
      }
    }
  } finally {
    await client
      .query("select pg_advisory_unlock(hashtext($1))", [tableName])
      .catch(() => undefined);
    client.release(true);
  }
  return applied;
}

async function loadKnown(client: PoolClient, tableName: string): Promise<Map<string, string>> {
  const r = await client.query<{ name: string; checksum: string }>(
    `select name, checksum from ${tableName}`,
  );
  return new Map(r.rows.map((z) => [z.name, z.checksum]));
}

/**
 * Runs one file and records it (US-DEV-07). Default: one transaction for the whole file, so a failure rolls it back
 * completely; `lock_timeout` is set for that transaction only (`set_config(..., true)`), a file may set its own.
 * Marked `-- migrate: no-transaction` (in its first lines): the statements run one after another, each in its own
 * transaction, so `create index concurrently` works. Then a failure leaves the statements before it applied and the file
 * unrecorded: such a file must hold only statements that are safe to run again after a partial failure (`if not exists`),
 * and an index that failed `concurrently` is left invalid and must be dropped before the file runs again.
 */
type Pending = { tableName: string; name: string; content: string; lockTimeoutMs: number };

async function apply(client: PoolClient, { tableName, name, content, lockTimeoutMs }: Pending) {
  const lock = `${lockTimeoutMs}ms`;
  const record = `insert into ${tableName} (name, checksum) values ($1, $2)`;
  if (hasNoTransactionMarker(content)) {
    await client.query("select set_config('lock_timeout', $1, false)", [lock]);
    for (const statement of splitStatements(content)) await client.query(statement);
    await client.query(record, [name, checksum(content)]);
    return;
  }
  await client.query("begin");
  try {
    await client.query("select set_config('lock_timeout', $1, true)", [lock]);
    await client.query(content);
    await client.query(record, [name, checksum(content)]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

const NO_TRANSACTION_MARKER = /^--\s*migrate:\s*no-transaction\s*$/;

/** True when one of the first lines of the file is the marker `-- migrate: no-transaction` (US-DEV-07). */
export function hasNoTransactionMarker(content: string): boolean {
  return content.split("\n", 5).some((line) => NO_TRANSACTION_MARKER.test(line.trim()));
}

/** The dollar quote that starts at `index`, such as `$$` or `$body$`, or null (`$1` is a parameter, not a quote). */
function dollarTagAt(sql: string, index: number): string | null {
  const before = sql[index - 1];
  if (before !== undefined && /[A-Za-z0-9_$]/.test(before)) return null;
  if (/[0-9]/.test(sql[index + 1] ?? "")) return null;
  let end = index + 1;
  while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end] as string)) end += 1;
  return sql[end] === "$" ? sql.slice(index, end + 1) : null;
}

/** Index just after the quoted text that starts at `index` (a doubled quote stays inside it). */
function skipQuoted(sql: string, index: number, quote: string): number {
  let i = index + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] !== quote) return i + 1;
      i += 2;
    } else i += 1;
  }
  return sql.length;
}

/**
 * Splits SQL text into its statements at the semicolons outside strings, quoted names, comments and dollar quotes
 * (US-DEV-07, for the files that run statement by statement). A part with nothing but comments is dropped.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let hasCode = false;
  const finish = (end: number) => {
    const text = sql.slice(start, end).trim();
    if (hasCode && text !== "") out.push(text);
    start = end + 1;
    hasCode = false;
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i] as string;
    if (c === "-" && sql[i + 1] === "-") {
      const eol = sql.indexOf("\n", i);
      i = eol < 0 ? sql.length : eol;
    } else if (c === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close < 0 ? sql.length : close + 2;
    } else if (c === ";") {
      finish(i);
      i += 1;
    } else if (c === "'" || c === '"') {
      hasCode = true;
      i = skipQuoted(sql, i, c);
    } else {
      const tag = c === "$" ? dollarTagAt(sql, i) : null;
      if (tag !== null) {
        const close = sql.indexOf(tag, i + tag.length);
        hasCode = true;
        i = close < 0 ? sql.length : close + tag.length;
      } else {
        if (!/\s/.test(c)) hasCode = true;
        i += 1;
      }
    }
  }
  finish(sql.length);
  return out;
}
