import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface ProfileRow {
  readonly displayName: string | null;
  readonly timeZone: string | null;
  readonly everythingPrivate: boolean;
  readonly noRecommendations: boolean;
  readonly notifications: Readonly<Record<string, boolean>>;
  readonly replenishBuffer: number;
}

/** What a save sends: `replenishBuffer: null` keeps the stored value. */
export type ProfileUpdate = Omit<ProfileRow, "replenishBuffer"> & {
  readonly replenishBuffer: number | null;
};

const COLUMNS = `display_name as "displayName", time_zone as "timeZone", everything_private as "everythingPrivate",
  no_recommendations as "noRecommendations", notification_settings as "notifications", replenish_buffer as "replenishBuffer"`;

/**
 * Adapter for the profile (US-ACC-02); every call runs as the account of the caller under the row rule (P-04): the
 * statements carry no account ID of their own, the rule alone decides which row they can see or change.
 */
export class ProfilePostgres {
  constructor(private readonly pool: Pool) {}

  /** `null` while the account has no data row yet. */
  async find(userId: string): Promise<ProfileRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ProfileRow>(`select ${COLUMNS} from account_data`),
    );
    return r.rows[0] ?? null;
  }

  /** `displayName: null` keeps the stored name (US-ACC-02). */
  async update(userId: string, p: ProfileUpdate): Promise<ProfileRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ProfileRow>(
        // A null name keeps the stored one (US-ACC-02); coalesce does it in the same statement, no read before.
        `update account_data set display_name = coalesce($1, display_name), time_zone = $2, everything_private = $3,
           no_recommendations = $4, notification_settings = $5::jsonb, replenish_buffer = coalesce($6, replenish_buffer)
         returning ${COLUMNS}`,
        [
          p.displayName,
          p.timeZone,
          p.everythingPrivate,
          p.noRecommendations,
          JSON.stringify(p.notifications),
          p.replenishBuffer,
        ],
      ),
    );
    return r.rows[0] ?? null;
  }
}
