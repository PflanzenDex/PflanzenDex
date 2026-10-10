// In-memory adapters for tests only; the PostgreSQL adapters live in `db`.
import {
  REMINDER_LIMITS,
  defaultReminderSettings,
  type ChannelStore,
  type Occasion,
  type OccasionSource,
  type PushSubscription,
  type ReminderChannel,
  type ReminderMessage,
  type ReminderRoster,
  type ReminderRow,
  type ReminderSettings,
  type ReminderStatus,
  type ReminderStore,
} from "./types";

export class InMemoryReminders implements ReminderStore {
  readonly rows = new Map<string, ReminderRow & { userId: string }>();
  private readonly saved = new Map<string, ReminderSettings>();
  private next = 1;

  async settings(userId: string) {
    return this.saved.get(userId) ?? defaultReminderSettings();
  }

  async saveSettings(userId: string, settings: ReminderSettings) {
    this.saved.set(userId, settings);
    return settings;
  }

  async create(
    userId: string,
    localDate: string,
    items: readonly Occasion[],
    status: ReminderStatus,
  ) {
    const key = `${userId}|${localDate}`;
    const known = this.rows.get(key);
    if (known) return { row: known, created: false };
    const row = {
      id: `r${this.next++}`,
      userId,
      localDate,
      items,
      status,
      attempts: 0,
      lastError: null,
    };
    this.rows.set(key, row);
    return { row, created: true };
  }

  async find(userId: string, localDate: string) {
    return this.rows.get(`${userId}|${localDate}`) ?? null;
  }

  async settle(
    userId: string,
    id: string,
    outcome: { status: ReminderStatus; attempts: number; error: string | null },
  ) {
    for (const [key, row] of this.rows)
      if (row.userId === userId && row.id === id)
        this.rows.set(key, {
          ...row,
          status: outcome.status,
          attempts: outcome.attempts,
          lastError: outcome.error,
        });
  }

  async list(userId: string, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && r.status !== "none")
      .sort((a, b) => b.localDate.localeCompare(a.localDate))
      .slice(0, limit);
  }
}

export class InMemoryChannels implements ChannelStore {
  private readonly rows = new Map<string, PushSubscription[]>();

  async subscriptions(userId: string) {
    return this.rows.get(userId) ?? [];
  }

  async add(userId: string, subscription: PushSubscription) {
    const own = this.rows.get(userId) ?? [];
    if (own.some((s) => s.endpoint === subscription.endpoint)) return "known" as const;
    if (own.length >= REMINDER_LIMITS.subscriptionsMax) return "limit" as const;
    this.rows.set(userId, [...own, subscription]);
    return "added" as const;
  }

  async remove(userId: string, endpoint: string) {
    const own = this.rows.get(userId) ?? [];
    this.rows.set(
      userId,
      own.filter((s) => s.endpoint !== endpoint),
    );
    return own.some((s) => s.endpoint === endpoint);
  }
}

/** A channel that records what it was asked to send; `failures` makes the next sends throw. */
export class RecordingChannel implements ReminderChannel {
  readonly sent: { userId: string; message: ReminderMessage }[] = [];
  failures = 0;

  async send(userId: string, message: ReminderMessage) {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("channel down");
    }
    this.sent.push({ userId, message });
  }
}

export const occasionsOf = (list: readonly Occasion[]): OccasionSource => ({
  occasions: async () => list,
});

export const rosterOf = (...accounts: { userId: string; timeZone: string }[]): ReminderRoster => ({
  accounts: async () => accounts,
});
