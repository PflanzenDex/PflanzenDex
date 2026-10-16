import type { Pool } from "pg";
import type { AchievementSeenState, AchievementSeenStore } from "@pflanzendex/core";
import { withAccount } from "../kernel/index.ts";

/**
 * Adapter for the seen state of the achievements (US-ACH-03); every call runs as the account of the caller under the
 * row rule (P-04): the read carries no account ID, the rule alone decides which row it sees.
 */
export class AchievementSeenPostgres implements AchievementSeenStore {
  constructor(private readonly pool: Pool) {}

  /** `null` while the account has no row yet. */
  async find(userId: string): Promise<AchievementSeenState | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<AchievementSeenState>(
        `select seen_achievements as seen, known_definitions as known from achievement_seen`,
      ),
    );
    return r.rows[0] ?? null;
  }

  /** Adds the ids, creating the row when missing, in one statement; answers the whole state. No id is stored twice. */
  async add(
    userId: string,
    seen: readonly string[],
    known: readonly string[],
  ): Promise<AchievementSeenState> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<AchievementSeenState>(
        `insert into achievement_seen (account_id, seen_achievements, known_definitions)
         values ($3, array(select distinct unnest($1::text[])), array(select distinct unnest($2::text[])))
         on conflict (account_id) do update
           set seen_achievements = array(select distinct unnest(
                 achievement_seen.seen_achievements || excluded.seen_achievements)),
               known_definitions = array(select distinct unnest(
                 achievement_seen.known_definitions || excluded.known_definitions)),
               updated_at = now()
         returning seen_achievements as seen, known_definitions as known`,
        [seen, known, userId],
      ),
    );
    // `insert ... returning` always yields exactly the one row of the account.
    return r.rows[0] as AchievementSeenState;
  }
}
