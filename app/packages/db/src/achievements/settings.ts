import type { Pool } from "pg";
import type {
  AchievementSettings,
  AchievementSettingsStore,
  RhythmPauseStore,
  StoredRhythmPause,
} from "@pflanzendex/core";
import { withAccount } from "../kernel/index.ts";

/** Adapter for the settings of the achievements (US-ACH-08); every call runs as the account of the caller (P-04). */
export class AchievementSettingsPostgres implements AchievementSettingsStore, RhythmPauseStore {
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

  /** The explicit pauses of the care rhythm (US-ACH-04), earliest first; dates as local calendar dates (NFR-08). */
  async listPauses(userId: string): Promise<readonly StoredRhythmPause[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<StoredRhythmPause>(
        `select id, to_char(from_on, 'YYYY-MM-DD') as "from", to_char(until_on, 'YYYY-MM-DD') as "until"
           from achievement_rhythm_pause order by from_on, id`,
      ),
    );
    return r.rows;
  }

  async addPause(
    userId: string,
    pause: { from: string; until: string },
  ): Promise<StoredRhythmPause> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<StoredRhythmPause>(
        `insert into achievement_rhythm_pause (account_id, from_on, until_on) values ($1, $2, $3)
         returning id, to_char(from_on, 'YYYY-MM-DD') as "from", to_char(until_on, 'YYYY-MM-DD') as "until"`,
        [userId, pause.from, pause.until],
      ),
    );
    return r.rows[0] as StoredRhythmPause;
  }

  async removePause(userId: string, id: string): Promise<boolean> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query("delete from achievement_rhythm_pause where id = $1", [id]),
    );
    return (r.rowCount ?? 0) > 0;
  }
}
