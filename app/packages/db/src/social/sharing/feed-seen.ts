import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

const INSTANT = `to_char(seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * Adapter for the "seen" state of "Neu bei Freunden" (US-SOZ-06). Every call runs as the account of the caller under the
 * row rule (P-04): the state is private to the account and no other account can read or change it.
 */
export class FeedSeenPostgres {
  constructor(private readonly pool: Pool) {}

  /** The instant up to which the account has seen the feed (UTC, ISO 8601); `null` = never opened. */
  async seenAt(userId: string): Promise<string | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ seenAt: string }>(`select ${INSTANT} as "seenAt" from feed_seen`),
    );
    return r.rows[0]?.seenAt ?? null;
  }

  /**
   * Marks the feed as seen up to `upTo`, never later than now and never backwards: a late or repeated call changes
   * nothing. Returns the state after the call.
   */
  async markSeen(userId: string, upTo: string): Promise<string> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ seenAt: string }>(
        `insert into feed_seen (account_id, seen_at) values ($1, least($2::timestamptz, now()))
         on conflict (account_id) do update set seen_at = greatest(feed_seen.seen_at, excluded.seen_at)
         returning ${INSTANT} as "seenAt"`,
        [userId, upTo],
      ),
    );
    return (r.rows[0] as { seenAt: string }).seenAt;
  }
}
