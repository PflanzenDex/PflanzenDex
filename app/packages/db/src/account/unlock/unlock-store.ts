import type { ManualUnlock, ManualUnlockStore } from "@pflanzendex/core";
import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

/** Adapter for the manual unlocks (US-ONB-05, DM-ONB-02); every call runs as the account of the caller (P-04). */
export class ManualUnlockPostgres implements ManualUnlockStore {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly ManualUnlock[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ManualUnlock>(
        `select function_id as id, to_char(unlocked_on, 'YYYY-MM-DD') as "unlockedOn"
           from account_unlock order by unlocked_on, function_id`,
      ),
    );
    return r.rows;
  }

  async add(userId: string, id: string, unlockedOn: string): Promise<ManualUnlock> {
    const r = await withAccount(this.pool, userId, async (c) => {
      await c.query(
        `insert into account_unlock (account_id, function_id, unlocked_on, source)
         values ($1, $2, $3, 'tap') on conflict (account_id, function_id) do nothing`,
        [userId, id, unlockedOn],
      );
      return c.query<ManualUnlock>(
        `select function_id as id, to_char(unlocked_on, 'YYYY-MM-DD') as "unlockedOn"
           from account_unlock where function_id = $1`,
        [id],
      );
    });
    return r.rows[0] as ManualUnlock;
  }
}
