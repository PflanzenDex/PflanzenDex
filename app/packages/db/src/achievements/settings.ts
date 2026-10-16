import type { Pool } from "pg";
import type { AchievementSettings, AchievementSettingsStore } from "@pflanzendex/core";
import { withAccount } from "../kernel/index.ts";

/** Adapter for the settings of the achievements (US-ACH-08); every call runs as the account of the caller (P-04). */
export class AchievementSettingsPostgres implements AchievementSettingsStore {
  constructor(private readonly pool: Pool) {}

  /** `null` while the account has no row yet. */
  async find(userId: string): Promise<AchievementSettings | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ calmMode: boolean }>('select calm_mode as "calmMode" from achievement_setting'),
    );
    return r.rows[0] ?? null;
  }

  async setCalmMode(userId: string, calmMode: boolean): Promise<AchievementSettings> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ calmMode: boolean }>(
        `insert into achievement_setting (account_id, calm_mode) values ($1, $2)
         on conflict (account_id) do update set calm_mode = excluded.calm_mode
         returning calm_mode as "calmMode"`,
        [userId, calmMode],
      ),
    );
    // `insert ... returning` always yields exactly the one row of the account.
    return r.rows[0] as AchievementSettings;
  }
}
