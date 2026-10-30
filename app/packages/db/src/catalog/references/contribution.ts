import type { PoolClient } from "pg";

/**
 * What a keeper contributed to the shared catalog (US-ACC-04): the species behind their proposals and the names of those,
 * reached through the keeper's review cases. The catalog itself belongs to nobody (E-02). Table name to the column that
 * holds the species id.
 */
export const CONTRIBUTED_TABLES: Readonly<Record<string, string>> = {
  species: "id",
  species_name: "species_id",
};

/** The rows of the contributed tables, in a fixed order, as the account itself (row rules apply). */
export async function contributedRows(
  c: PoolClient,
  accountId: string,
): Promise<Record<string, Readonly<Record<string, unknown>>[]>> {
  const out: Record<string, Readonly<Record<string, unknown>>[]> = {};
  for (const [table, column] of Object.entries(CONTRIBUTED_TABLES)) {
    const r = await c.query<{ row: Record<string, unknown> }>(
      `select to_jsonb(t) as row from "${table}" t
        where "${column}" in (select object_id from review_case where account_id = $1 and object_kind = 'species')
        order by to_jsonb(t)::text`,
      [accountId],
    );
    out[table] = r.rows.map((z) => z.row);
  }
  return out;
}
