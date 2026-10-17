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

export type MigrationsOptions = { directory?: string; tableName?: string };

const checksum = (content: string) => createHash("sha256").update(content).digest("hex");

/**
 * Applies not yet applied `*.sql` files in name order, each in its own transaction.
 * Forward only: an already applied file must never change (checksum). Returns the newly applied names.
 * An advisory lock prevents two processes from migrating at the same time.
 */
export async function migrate(pool: Pool, options: MigrationsOptions = {}): Promise<string[]> {
  const directory = options.directory ?? MIGRATIONS_DIRECTORY;
  const tableName = options.tableName ?? MIGRATIONS_TABLE_NAME;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory comes from a constant or the caller, never from user input
  const files = readdirSync(directory)
    .filter((d) => d.endsWith(".sql"))
    .sort();
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
        await apply(client, tableName, name, content);
        applied.push(name);
      } else if (alt !== checksum(content)) {
        throw new Error(`Migration ${name} was changed after it was applied`);
      }
    }
  } finally {
    await client
      .query("select pg_advisory_unlock(hashtext($1))", [tableName])
      .catch(() => undefined);
    client.release();
  }
  return applied;
}

async function loadKnown(client: PoolClient, tableName: string): Promise<Map<string, string>> {
  const r = await client.query<{ name: string; checksum: string }>(
    `select name, checksum from ${tableName}`,
  );
  return new Map(r.rows.map((z) => [z.name, z.checksum]));
}

async function apply(
  client: PoolClient,
  tableName: string,
  name: string,
  content: string,
): Promise<void> {
  try {
    await client.query("begin");
    await client.query(content);
    await client.query(`insert into ${tableName} (name, checksum) values ($1, $2)`, [
      name,
      checksum(content),
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
