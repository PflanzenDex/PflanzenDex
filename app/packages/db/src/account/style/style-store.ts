import type { KeeperStyle, KeeperStyleChoice, KeeperStyleStore } from "@pflanzendex/core";
import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

const COLUMNS = `style, to_char(chosen_on, 'YYYY-MM-DD') as "chosenOn"`;

/** Adapter for the keeper style (US-ONB-03, DM-ONB-01); every call runs as the account of the caller (P-04). */
export class KeeperStylePostgres implements KeeperStyleStore {
  constructor(private readonly pool: Pool) {}

  /** `null` while the account has no row. */
  async find(userId: string): Promise<KeeperStyleChoice | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<KeeperStyleChoice>(`select ${COLUMNS} from account_style`),
    );
    return r.rows[0] ?? null;
  }

  async set(userId: string, style: KeeperStyle, chosenOn: string): Promise<KeeperStyleChoice> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<KeeperStyleChoice>(
        `insert into account_style (account_id, style, chosen_on) values ($1, $2, $3)
         on conflict (account_id) do update set style = excluded.style, chosen_on = excluded.chosen_on
         returning ${COLUMNS}`,
        [userId, style, chosenOn],
      ),
    );
    // `insert ... returning` always yields exactly the one row of the account.
    return r.rows[0] as KeeperStyleChoice;
  }
}
