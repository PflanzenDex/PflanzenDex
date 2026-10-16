import type { Pool, PoolClient } from "pg";
import { contributedRows } from "../../catalog/index.ts";
import { withAccount } from "../../kernel/index.ts";
import {
  accountTables,
  PHOTO_COLUMNS,
  quoted,
  SECRET_COLUMNS,
  type AccountTable,
} from "./tables.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export type ExportRow = Readonly<Record<string, unknown>>;
export interface PhotoRef {
  readonly table: string;
  readonly column: string;
  readonly name: string;
}
export interface AccountDataSnapshot {
  readonly tables: Readonly<Record<string, readonly ExportRow[]>>;
  readonly photos: readonly PhotoRef[];
}

/** Rows come out in a fixed order (their JSON text), so the same data always gives the same file (US-ACC-04). */
async function ownRows(c: PoolClient, t: AccountTable, accountId: string): Promise<ExportRow[]> {
  const secret = SECRET_COLUMNS[t.name] ?? [];
  const r = await c.query<{ row: ExportRow }>(
    `select to_jsonb(t) - $2::text[] as row from ${quoted(t.name)} t where ${quoted(t.id)} = $1
      order by (to_jsonb(t) - $2::text[])::text`,
    [accountId, secret],
  );
  return r.rows.map((z) => z.row);
}

function photosOf(tables: Record<string, readonly ExportRow[]>): PhotoRef[] {
  return PHOTO_COLUMNS.flatMap(({ table, column }) =>
    (tables[table] ?? []).flatMap((row) => {
      const name = row[column];
      return typeof name === "string" && name !== "" ? [{ table, column, name }] : [];
    }),
  );
}

/**
 * Reads everything the account owns, in one transaction as the account itself, so the row rules decide what is
 * visible (P-04). The tables come from the catalog (see `tables.ts`): none can be forgotten. The reads never write.
 */
export class AccountDataPostgres {
  constructor(private readonly pool: Pool) {}

  /** `null` when the account does not exist. */
  async read(accountId: string): Promise<AccountDataSnapshot | null> {
    return withAccount(this.pool, accountId, async (c) => {
      const tables: Record<string, readonly ExportRow[]> = {};
      for (const t of await accountTables(c)) tables[t.name] = await ownRows(c, t, accountId);
      if ((tables["account"] ?? []).length === 0) return null;
      Object.assign(tables, await contributedRows(c, accountId));
      return { tables, photos: photosOf(tables) };
    });
  }
}
