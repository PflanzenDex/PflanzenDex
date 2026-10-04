import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface ProfileRow {
  readonly displayName: string | null;
  readonly timeZone: string | null;
  readonly everythingPrivate: boolean;
  readonly noRecommendations: boolean;
  readonly notifications: Readonly<Record<string, boolean>>;
}

const COLUMNS = `display_name as "displayName", time_zone as "timeZone", everything_private as "everythingPrivate",
  no_recommendations as "noRecommendations", notification_settings as "notifications"`;

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

  async update(userId: string, p: ProfileRow): Promise<ProfileRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ProfileRow>(
        `update account_data set display_name = $1, time_zone = $2, everything_private = $3,
           no_recommendations = $4, notification_settings = $5::jsonb
         returning ${COLUMNS}`,
        [
          p.displayName,
          p.timeZone,
          p.everythingPrivate,
          p.noRecommendations,
          JSON.stringify(p.notifications),
        ],
      ),
    );
    return r.rows[0] ?? null;
  }
}
