import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface FertilizingEntryRow {
  readonly specimenId: string;
  readonly date: string;
}

/**
 * Adapter for the fertilizing log (US-MON-09); every call runs as the account of the caller under the row rules (P-04).
 * The specimen hangs on the own account through the composite foreign key (account_id, specimen_id). Dates are local
 * calendar dates and come back as text (NFR-08).
 */
export class FertilizingPostgres {
  constructor(private readonly pool: Pool) {}

  /** The latest fertilizing date per specimen; foreign and never-fertilized specimens are absent. */
  async lastFertilized(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const latest = new Map<string, string>();
    await withAccount(this.pool, userId, async (c) => {
      const found = await c.query<{ specimenId: string; date: string }>(
        `select specimen_id as "specimenId", to_char(max(fertilized_on), 'YYYY-MM-DD') as date
           from fertilizing_log
          where specimen_id = any($1::uuid[])
          group by specimen_id`,
        [specimenIds],
      );
      for (const z of found.rows) latest.set(z.specimenId, z.date);
    });
    return latest;
  }

  /** One transaction; the unique day makes a repeat write nothing. Returns how many entries are new. */
  async record(
    userId: string,
    entries: readonly FertilizingEntryRow[],
  ): Promise<{ readonly created: number }> {
    if (entries.length === 0) return { created: 0 };
    const r = await withAccount(this.pool, userId, (c) =>
      c.query(
        `insert into fertilizing_log (account_id, specimen_id, fertilized_on)
         select $1, specimen_id, fertilized_on
         from unnest($2::uuid[], $3::date[]) as t(specimen_id, fertilized_on)
         on conflict (account_id, specimen_id, fertilized_on) do nothing`,
        [userId, entries.map((e) => e.specimenId), entries.map((e) => e.date)],
      ),
    );
    return { created: r.rowCount ?? 0 };
  }
}
