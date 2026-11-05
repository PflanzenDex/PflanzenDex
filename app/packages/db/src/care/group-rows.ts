import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

/**
 * The rows of several specimens, grouped per specimen (NFR-12: one query for all IDs). Each group keeps the order of the
 * rows, so the statement's sort order is the order of every group.
 */
export function groupBySpecimen<T extends { readonly specimenId: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const own = grouped.get(row.specimenId);
    if (own) own.push(row);
    else grouped.set(row.specimenId, [row]);
  }
  return grouped;
}

/**
 * One statement for the rows of several specimens, as the caller's account (row rules, P-04), grouped per specimen
 * (NFR-12). `sql` takes the specimen IDs as `$1` and sorts the rows; no IDs, no query.
 */
export async function readGrouped<T extends { readonly specimenId: string }>(
  pool: Pool,
  userId: string,
  specimenIds: readonly string[],
  sql: string,
): Promise<Map<string, T[]>> {
  if (specimenIds.length === 0) return new Map();
  const r = await withAccount(pool, userId, (c) => c.query<T>(sql, [specimenIds]));
  return groupBySpecimen(r.rows);
}
