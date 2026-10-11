// Reminders (epic MON, US-MON-01, US-MON-08): `core` holds the rules and the ports; the PostgreSQL adapters live in `db`,
// the delivery channel and the clock in `api` (AB-1). What needs action comes from the central status function through
// the port `OccasionSource` (FR-MON-03: Today and reminders cannot disagree); nothing here is bound to a channel (FR-MON-01).

/** The occasions a reminder can be switched for (US-MON-08); the same words as the account settings (US-ACC-02). */
export const REMINDER_OCCASIONS = [
  "phase",
  "treatment",
  "measurement",
  "watering",
  "swap",
  "friends",
] as const;
export type ReminderOccasion = (typeof REMINDER_OCCASIONS)[number];

/** Starting values and limits (assumptions, decided by the PO; adjustable per account where a setting exists). */
export const REMINDER_LIMITS = {
  /** Local time of the daily check (US-MON-01: default 08:00). */
  defaultSendTime: "08:00",
  /** Days after which a measurement counts as overdue (US-MON-04: default 30, adjustable). */
  measurementDays: { min: 1, max: 365, default: 30 },
  /** Attempts to deliver one message before it is marked failed (FR-MON-08). */
  deliveryAttempts: 3,
  /** A check that has not started this long after its time is dropped as expired and stays visible (P-10). */
  jobExpiryHours: 6,
  /** The newest reminders the inbox shows. */
  inboxMax: 30,
  /** Push subscriptions per account and field lengths (assumption). */
  subscriptionsMax: 10,
  endpointMax: 2000,
  keyMax: 200,
} as const;

/** One thing that needs action, derived by the status function; never stored on its own (P-01). */
export interface Occasion {
  /** Stable per cause (`treatment:<id>`, `measurement:<specimen>`), so the same occasion is the same on every day. */
  readonly id: string;
  readonly occasion: ReminderOccasion;
  readonly text: string;
  /** What to do next (P-09). */
  readonly nextAction: string;
}

/** Port: what needs action for the account at `now`; the app root derives it from the central status function. */
export interface OccasionSource {
  occasions(userId: string, timeZone: string, now: Date): Promise<readonly Occasion[]>;
}

/** The reminder settings of one account (US-MON-08). A switch off per occasion lives in the profile (US-ACC-02). */
export interface ReminderSettings {
  /** `HH:MM`, local time of the account. */
  readonly sendTime: string;
  /** Quiet hours `HH:MM`, both or none; a window may reach over midnight. Nothing is delivered inside it. */
  readonly quietFrom: string | null;
  readonly quietTo: string | null;
  /** Per occasion: paused until this local date (inclusive); data and the Today list stay untouched (FR-MON-03). */
  readonly paused: Readonly<Partial<Record<ReminderOccasion, string>>>;
  readonly measurementDays: number;
}

export const defaultReminderSettings = (): ReminderSettings => ({
  sendTime: REMINDER_LIMITS.defaultSendTime,
  quietFrom: null,
  quietTo: null,
  paused: {},
  measurementDays: REMINDER_LIMITS.measurementDays.default,
});

/**
 * `none`: checked, nothing to do, nothing sent (US-MON-01); `pending`: stored, delivery open; `in_app`: stored for the
 * inbox, no push channel exists; `delivered`; `failed`: three attempts used (FR-MON-08).
 */
export type ReminderStatus = "none" | "pending" | "in_app" | "delivered" | "failed";

export interface ReminderRow {
  readonly id: string;
  /** Local calendar date the check was made for (NFR-08). */
  readonly localDate: string;
  readonly items: readonly Occasion[];
  readonly status: ReminderStatus;
  readonly attempts: number;
  readonly lastError: string | null;
}

/** Port for reminders and their settings; every call is for the account `userId` only (P-04). */
export interface ReminderStore {
  /** The defaults while the account never saved settings. */
  settings(userId: string): Promise<ReminderSettings>;
  saveSettings(userId: string, settings: ReminderSettings): Promise<ReminderSettings>;
  /** One row per account and local day: a second create returns the existing row with `created: false` (FR-MON-02). */
  create(
    userId: string,
    localDate: string,
    items: readonly Occasion[],
    status: ReminderStatus,
  ): Promise<{ readonly row: ReminderRow; readonly created: boolean }>;
  find(userId: string, localDate: string): Promise<ReminderRow | null>;
  /** Records the outcome of a delivery attempt. */
  settle(
    userId: string,
    id: string,
    outcome: { status: ReminderStatus; attempts: number; error: string | null },
  ): Promise<void>;
  /** Newest first, without the days on which nothing was due. */
  list(userId: string, limit: number): Promise<readonly ReminderRow[]>;
}

/** A browser's push subscription (Web Push, RFC 8030): the endpoint and the two keys of the subscription. */
export interface PushSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/** Port for the delivery channels of an account (DM-MON-01 `delivery_channel`). */
export interface ChannelStore {
  subscriptions(userId: string): Promise<readonly PushSubscription[]>;
  /** Idempotent per endpoint; `false` when the account is at the limit. */
  add(userId: string, subscription: PushSubscription): Promise<"added" | "known" | "limit">;
  remove(userId: string, endpoint: string): Promise<boolean>;
}

/** The one bundled message of a day (US-MON-01). */
export interface ReminderMessage {
  readonly title: string;
  readonly body: string;
  readonly items: readonly Occasion[];
}

/**
 * Port of the delivery (E-10: web push, optional email). Throws when the delivery fails; the caller counts attempts
 * (FR-MON-08). The real adapter needs VAPID keys (web push) or SMTP (email) and is not built yet; a stub adapter runs
 * in its place.
 */
export interface ReminderChannel {
  send(
    userId: string,
    message: ReminderMessage,
    subscriptions: readonly PushSubscription[],
  ): Promise<void>;
}

/** Port: the accounts that get reminders, with their time zone; only accounts with a known zone (NFR-08, P-08). */
export interface ReminderRoster {
  accounts(): Promise<readonly { readonly userId: string; readonly timeZone: string }[]>;
}

/** One entry of the watering log (DM-MON-01): the local calendar date on which the specimen was watered (NFR-08). */
export interface WateringEntry {
  readonly specimenId: string;
  readonly date: string;
}

/**
 * Port for the watering log (US-MON-05); every call is for the account `userId` only (P-04). `sensor` entries
 * (US-MON-06) will come through the same table; today only `manual` ones are written.
 */
export interface WateringStore {
  /** The latest watering date per specimen over all sources; specimens never watered are absent. */
  lastWatered(userId: string, specimenIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * Writes the manual entries of one call in one transaction. One entry per specimen and day: a repeat creates
   * nothing new. Returns how many entries are new.
   */
  record(userId: string, entries: readonly WateringEntry[]): Promise<{ readonly created: number }>;
}
