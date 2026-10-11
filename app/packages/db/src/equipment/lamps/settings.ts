import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

/** Adapter for the keeper's deviation limit of the lamps (US-EQU-03); `null` = not set. */
export class DeviationLimitPostgres {
  constructor(private readonly pool: Pool) {}

  async limit(userId: string): Promise<number | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ percent: number | null }>(
        "select deviation_percent as percent from equipment_setting",
      ),
    );
    return r.rows[0]?.percent ?? null;
  }

  async setLimit(userId: string, percent: number | null): Promise<number | null> {
    await withAccount(this.pool, userId, (c) =>
      c.query(
        `insert into equipment_setting (account_id, deviation_percent) values ($1, $2)
         on conflict (account_id) do update set deviation_percent = excluded.deviation_percent`,
        [userId, percent],
      ),
    );
    return percent;
  }
}
