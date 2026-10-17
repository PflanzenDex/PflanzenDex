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
  readonly rarityConsent: boolean;
  /** Four descending lux values of the light overview (US-LIC-03); `null` = standard values. */
  readonly positionThresholds: readonly number[] | null;
}

/** What a save sends: `replenishBuffer`, `rarityConsent` and `positionThresholds` set to `null` keep the stored values. */
export type ProfileUpdate = Omit<
  ProfileRow,
  "replenishBuffer" | "rarityConsent" | "positionThresholds"
> & {
  readonly replenishBuffer: number | null;
  readonly rarityConsent: boolean | null;
  readonly positionThresholds: readonly number[] | null;
};

const COLUMNS = `display_name as "displayName", time_zone as "timeZone", everything_private as "everythingPrivate",
  no_recommendations as "noRecommendations", notification_settings as "notifications", replenish_buffer as "replenishBuffer",
  rarity_consent as "rarityConsent", position_thresholds as "positionThresholds"`;

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
           no_recommendations = $4, notification_settings = $5::jsonb, replenish_buffer = coalesce($6, replenish_buffer),
           rarity_consent = coalesce($7, rarity_consent),
           position_thresholds = coalesce($8::jsonb, position_thresholds)
         returning ${COLUMNS}`,
        [
          p.displayName,
          p.timeZone,
          p.everythingPrivate,
          p.noRecommendations,
          JSON.stringify(p.notifications),
          p.replenishBuffer,
          p.rarityConsent,
          p.positionThresholds === null ? null : JSON.stringify(p.positionThresholds),
        ],
      ),
    );
    return r.rows[0] ?? null;
  }

  /**
   * The accounts that consented to count in the rarity in PflanzenDex (US-POK-14). Not account-scoped on purpose: the
   * checked database function `rarity_participants()` answers for all accounts but returns only the consenting ones.
   */
  async rarityParticipants(): Promise<readonly string[]> {
    const r = await this.pool.query<{ account_id: string }>(
      "select account_id from rarity_participants()",
    );
    return r.rows.map((x) => x.account_id);
  }
}
