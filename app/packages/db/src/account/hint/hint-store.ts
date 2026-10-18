import type { HintRecord, HintStore } from "@pflanzendex/core";
import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

const COLUMNS = `occasion, to_char(shown_on, 'YYYY-MM-DD') as "shownOn", to_char(dismissed_on, 'YYYY-MM-DD') as "dismissedOn"`;

/** Adapter for the hints and the end of the first-plant guide (US-ONB-07, DM-ONB-03); every call runs as the account of the caller (P-04). */
export class HintPostgres implements HintStore {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly HintRecord[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<HintRecord>(`select ${COLUMNS} from account_hint order by shown_on, occasion`),
    );
    return r.rows;
  }

  async show(userId: string, occasion: string, on: string): Promise<HintRecord> {
    return this.write(userId, occasion, on, null);
  }

  async dismiss(userId: string, occasion: string, on: string): Promise<HintRecord> {
    return this.write(userId, occasion, on, on);
  }

  /** The first shown date and the first dismissal date stay (nothing is overwritten, P-10). */
  private async write(
    userId: string,
    occasion: string,
    shownOn: string,
    dismissedOn: string | null,
  ): Promise<HintRecord> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<HintRecord>(
        `insert into account_hint (account_id, occasion, shown_on, dismissed_on) values ($1, $2, $3, $4)
         on conflict (account_id, occasion) do update
           set dismissed_on = coalesce(account_hint.dismissed_on, excluded.dismissed_on)
         returning ${COLUMNS}`,
        [userId, occasion, shownOn, dismissedOn],
      ),
    );
    // `insert ... returning` always yields exactly the one row.
    return r.rows[0] as HintRecord;
  }
}
