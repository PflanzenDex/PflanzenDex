import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

/** An instant column or expression as UTC ISO 8601 with microseconds: the format of `seenAt`, `markSeen` and `now`. */
const instant = (expr: string) =>
  `to_char(${expr} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const INSTANT = instant("seen_at");

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
   * The database's current instant: the clock that stamps visible_since and clamps markSeen, so the banner's `asOf` and
   * the shares it compares with come from one clock (US-SOZ-06). No account data is read, so no account is set.
   */
  async now(): Promise<string> {
    const r = await this.pool.query<{ now: string }>(`select ${instant("now()")} as "now"`);
    return (r.rows[0] as { now: string }).now;
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
