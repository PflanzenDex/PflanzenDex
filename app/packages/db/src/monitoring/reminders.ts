import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface OccasionRow {
  readonly id: string;
  readonly occasion: "phase" | "treatment" | "measurement" | "watering" | "swap" | "friends";
  readonly text: string;
  readonly nextAction: string;
}
export type ReminderStatus = "none" | "pending" | "in_app" | "delivered" | "failed";
export interface ReminderRow {
  readonly id: string;
  readonly localDate: string;
  readonly items: readonly OccasionRow[];
  readonly status: ReminderStatus;
  readonly attempts: number;
  readonly lastError: string | null;
}
export interface SettingsRow {
  readonly sendTime: string;
  readonly quietFrom: string | null;
  readonly quietTo: string | null;
  readonly paused: Readonly<Record<string, string>>;
  readonly measurementDays: number;
}
export interface SubscriptionRow {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

const DEFAULTS: SettingsRow = {
  sendTime: "08:00",
  quietFrom: null,
  quietTo: null,
  paused: {},
  measurementDays: 30,
};
// `to_char` keeps the dates and times as plain strings: no time zone shift by the driver (NFR-08).
const SETTINGS = `to_char(send_time, 'HH24:MI') as "sendTime", to_char(quiet_from, 'HH24:MI') as "quietFrom",
  to_char(quiet_to, 'HH24:MI') as "quietTo", paused, measurement_days as "measurementDays"`;
const REMINDER = `id, to_char(local_date, 'YYYY-MM-DD') as "localDate", items, status, attempts, last_error as "lastError"`;
const SUBSCRIPTION_LIMIT = 10;

/** Adapter for the reminders and their settings (US-MON-01, US-MON-08); every call runs as the caller's account (P-04). */
export class RemindersPostgres {
  constructor(private readonly pool: Pool) {}

  /** The defaults while the account never saved settings. */
  async settings(userId: string): Promise<SettingsRow> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SettingsRow>(`select ${SETTINGS} from reminder_setting`),
    );
    return r.rows[0] ?? DEFAULTS;
  }

  async saveSettings(userId: string, s: SettingsRow): Promise<SettingsRow> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SettingsRow>(
        `insert into reminder_setting (account_id, send_time, quiet_from, quiet_to, paused, measurement_days, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, now())
         on conflict (account_id) do update set send_time = excluded.send_time, quiet_from = excluded.quiet_from,
           quiet_to = excluded.quiet_to, paused = excluded.paused, measurement_days = excluded.measurement_days,
           updated_at = now()
         returning ${SETTINGS}`,
        [userId, s.sendTime, s.quietFrom, s.quietTo, JSON.stringify(s.paused), s.measurementDays],
      ),
    );
    return r.rows[0] as SettingsRow;
  }

  /** One row per local day: a second create returns the stored row with `created: false` (FR-MON-02). */
  async create(
    userId: string,
    localDate: string,
    items: readonly OccasionRow[],
    status: ReminderStatus,
  ): Promise<{ row: ReminderRow; created: boolean }> {
    return withAccount(this.pool, userId, async (c) => {
      const made = await c.query<ReminderRow>(
        `insert into reminder (account_id, local_date, items, status) values ($1, $2, $3::jsonb, $4)
         on conflict (account_id, local_date) do nothing returning ${REMINDER}`,
        [userId, localDate, JSON.stringify(items), status],
      );
      if (made.rows[0]) return { row: made.rows[0], created: true };
      const known = await c.query<ReminderRow>(
        `select ${REMINDER} from reminder where local_date = $1`,
        [localDate],
      );
      return { row: known.rows[0] as ReminderRow, created: false };
    });
  }

  async find(userId: string, localDate: string): Promise<ReminderRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ReminderRow>(`select ${REMINDER} from reminder where local_date = $1`, [localDate]),
    );
    return r.rows[0] ?? null;
  }

  async settle(
    userId: string,
    id: string,
    outcome: { status: ReminderStatus; attempts: number; error: string | null },
  ): Promise<void> {
    await withAccount(this.pool, userId, (c) =>
      c.query("update reminder set status = $2, attempts = $3, last_error = $4 where id = $1", [
        id,
        outcome.status,
        outcome.attempts,
        outcome.error,
      ]),
    );
  }

  /** Newest first, without the days on which nothing was due. */
  async list(userId: string, limit: number): Promise<ReminderRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ReminderRow>(
        `select ${REMINDER} from reminder where status <> 'none' order by local_date desc limit $1`,
        [limit],
      ),
    );
    return r.rows;
  }
}

/** Adapter for the push subscriptions of an account (DM-MON-01 `delivery_channel`). */
export class ChannelsPostgres {
  constructor(private readonly pool: Pool) {}

  async subscriptions(userId: string): Promise<SubscriptionRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SubscriptionRow>(
        "select endpoint, p256dh, auth from delivery_channel order by created_at, id",
      ),
    );
    return r.rows;
  }

  async add(userId: string, s: SubscriptionRow): Promise<"added" | "known" | "limit"> {
    return withAccount(this.pool, userId, async (c) => {
      const known = await c.query("select 1 from delivery_channel where endpoint = $1", [
        s.endpoint,
      ]);
      if (known.rows.length > 0) return "known";
      const n = await c.query<{ n: string }>("select count(*) as n from delivery_channel");
      if (Number(n.rows[0]?.n) >= SUBSCRIPTION_LIMIT) return "limit";
      await c.query(
        "insert into delivery_channel (account_id, endpoint, p256dh, auth) values ($1, $2, $3, $4) on conflict do nothing",
        [userId, s.endpoint, s.p256dh, s.auth],
      );
      return "added";
    });
  }

  async remove(userId: string, endpoint: string): Promise<boolean> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query("delete from delivery_channel where endpoint = $1", [endpoint]),
    );
    return (r.rowCount ?? 0) > 0;
  }
}

/**
 * The accounts that get reminders: those with a time zone in their profile (NFR-08, nothing is guessed for the others),
 * read through the function `reminder_accounts()` that only the owner role may call (US-MON-01). Needs the owner pool.
 */
export class RosterPostgres {
  constructor(private readonly pool: Pool) {}

  async accounts(): Promise<{ userId: string; timeZone: string }[]> {
    const r = await this.pool.query<{ userId: string; timeZone: string }>(
      `select account_id as "userId", time_zone as "timeZone" from reminder_accounts()`,
    );
    return r.rows;
  }
}
