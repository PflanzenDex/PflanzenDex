import type { KeeperSwitchId, KeeperSwitchRow, KeeperSwitchStore } from "@pflanzendex/core";
import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

const COLUMNS = `feature, enabled, to_char(changed_on, 'YYYY-MM-DD') as "changedOn"`;

/** Adapter for the keeper switches (US-ONB-09, DM-ONB-04); every call runs as the account of the caller (P-04). */
export class KeeperSwitchPostgres implements KeeperSwitchStore {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly KeeperSwitchRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<KeeperSwitchRow>(`select ${COLUMNS} from account_keeper_switch order by feature`),
    );
    return r.rows;
  }

  /** One statement. The date moves only when the state changes; repeating the state keeps the day of the change. */
  async set(
    userId: string,
    feature: KeeperSwitchId,
    enabled: boolean,
    on: string,
  ): Promise<KeeperSwitchRow> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<KeeperSwitchRow>(
        `insert into account_keeper_switch (account_id, feature, enabled, changed_on) values ($1, $2, $3, $4)
         on conflict (account_id, feature) do update set
           changed_on = case when account_keeper_switch.enabled = excluded.enabled
             then account_keeper_switch.changed_on else excluded.changed_on end,
           enabled = excluded.enabled
         returning ${COLUMNS}`,
        [userId, feature, enabled, on],
      ),
    );
    // `insert ... returning` always yields exactly the one row of the feature.
    return r.rows[0] as KeeperSwitchRow;
  }
}
