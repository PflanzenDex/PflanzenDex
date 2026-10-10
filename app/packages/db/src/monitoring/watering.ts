import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface WateringEntryRow {
  readonly specimenId: string;
  readonly date: string;
}

/**
 * Adapter for the watering log (US-MON-05); every call runs as the account of the caller under the row rules (P-04). The
 * specimen hangs on the own account through the composite foreign key (account_id, specimen_id). Dates are local
 * calendar dates and come back as text (NFR-08).
 */
export class WateringPostgres {
  constructor(private readonly pool: Pool) {}

  /** The latest watering date per specimen over all sources; foreign and never-watered specimens are absent. */
  async lastWatered(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (specimenIds.length === 0) return new Map();
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ specimenId: string; date: string }>(
        `select specimen_id as "specimenId", to_char(max(watered_on), 'YYYY-MM-DD') as date
         from watering_log where specimen_id = any($1) group by specimen_id`,
        [specimenIds],
      ),
    );
    return new Map(r.rows.map((z) => [z.specimenId, z.date]));
  }

  /** One transaction; the unique day makes a repeat write nothing. Returns how many entries are new. */
  async record(
    userId: string,
    entries: readonly WateringEntryRow[],
  ): Promise<{ readonly created: number }> {
    if (entries.length === 0) return { created: 0 };
    const r = await withAccount(this.pool, userId, (c) =>
      c.query(
        `insert into watering_log (account_id, specimen_id, watered_on, source)
         select $1, specimen_id, watered_on, 'manual'
         from unnest($2::uuid[], $3::date[]) as t(specimen_id, watered_on)
         on conflict (account_id, specimen_id, watered_on, source) do nothing`,
        [userId, entries.map((e) => e.specimenId), entries.map((e) => e.date)],
      ),
    );
    return { created: r.rowCount ?? 0 };
  }
}
