// The daily reminder (US-MON-01): a scheduler that orders one background job per account and local day at the chosen
// time, and the handler of that job (TE-06, repeatable): derive what needs action through the central status function,
// bundle it, store it and hand it to the channel. Local calendar days throughout (NFR-08).
import { enqueueJob, type JobHandler, type JobQueue, type JobRow } from "../../jobs";
import { isTimeZone, localInstant, localToday } from "../../kernel";
import { bundleOf, deliveryTime } from "./bundle";
import {
  REMINDER_LIMITS,
  type ChannelStore,
  type OccasionSource,
  type ReminderChannel,
  type ReminderMessage,
  type ReminderRoster,
  type ReminderRow,
  type ReminderStore,
} from "../types";

/** Job type `<module>.<job>` (TE-06). */
export const REMINDER_JOB_TYPE = "monitoring.send_reminders";

export interface SchedulerDependencies {
  readonly roster: ReminderRoster;
  readonly reminders: ReminderStore;
  readonly queue: JobQueue;
}

/**
 * Orders the check of every account whose chosen time of today has come and that has no row for today yet. The check
 * of one account and day is one job (dedupe key), so a repeated tick, a second process or a restart orders nothing
 * twice (US-QS-03, FR-MON-02). A job that does not start within 6 hours of its time expires and stays visible (P-10).
 * Returns the number of orders made.
 */
export async function scheduleReminders(deps: SchedulerDependencies, now: Date): Promise<number> {
  let ordered = 0;
  for (const { userId, timeZone } of await deps.roster.accounts()) {
    if (!isTimeZone(timeZone)) continue;
    const today = localToday(now, timeZone);
    if (await deps.reminders.find(userId, today)) continue;
    const runAt = localInstant(
      today,
      deliveryTime(await deps.reminders.settings(userId)),
      timeZone,
    );
    if (runAt.getTime() > now.getTime()) continue;
    const r = await enqueueJob(
      { queue: deps.queue, now: () => now },
      {
        type: REMINDER_JOB_TYPE,
        dedupeKey: `reminders:${userId}:${today}`,
        payload: { userId, date: today, timeZone },
        runAt,
        expiresAt: new Date(runAt.getTime() + REMINDER_LIMITS.jobExpiryHours * 3_600_000),
        maxAttempts: REMINDER_LIMITS.deliveryAttempts,
      },
    );
    if (!r.ok) throw new Error(r.error.code);
    if (r.value.created) ordered += 1;
  }
  return ordered;
}

export interface ReminderDependencies {
  readonly reminders: ReminderStore;
  readonly channels: ChannelStore;
  readonly source: OccasionSource;
  readonly channel: ReminderChannel;
}

/** The one bundled message of a day (US-MON-01): a short title and the count; the items carry the texts. */
export function messageOf(row: Pick<ReminderRow, "items">): ReminderMessage {
  const n = row.items.length;
  return {
    title: "PflanzenDex",
    body: n === 1 ? "1 Sache braucht heute dich." : `${n} Sachen brauchen heute dich.`,
    items: row.items,
  };
}

function payloadOf(job: JobRow): { userId: string; date: string; timeZone: string } {
  const { userId, date, timeZone } = job.payload;
  if (typeof userId !== "string" || typeof date !== "string" || !isTimeZone(timeZone))
    throw new Error("monitoring.send_reminders: payload incomplete");
  return { userId, date, timeZone };
}

/**
 * Handler of the job `monitoring.send_reminders`, repeatable (US-QS-03): the day is one row per account, so a rerun
 * after a crash neither derives nor sends twice. Without need for action a row with status `none` is written and nothing
 * is sent (US-MON-01). Otherwise the bundle is stored (the in-app reminder, never lost, P-10) and handed to the channel
 * for every push subscription; with no subscription it stays `in_app`. A failing delivery is counted and thrown, so
 * the queue retries; after the third attempt the row is `failed` and visible (FR-MON-08).
 */
export const sendRemindersHandler =
  (deps: ReminderDependencies): JobHandler =>
  async (job, now) => {
    const { userId, date, timeZone } = payloadOf(job);
    const known = await deps.reminders.find(userId, date);
    if (known && known.status !== "pending") return;
    const row = known ?? (await store(deps, { userId, date, timeZone }, now));
    if (row === null || row.status !== "pending") return;
    const subscriptions = await deps.channels.subscriptions(userId);
    if (subscriptions.length === 0) {
      await deps.reminders.settle(userId, row.id, {
        status: "in_app",
        attempts: row.attempts,
        error: null,
      });
      return;
    }
    try {
      await deps.channel.send(userId, messageOf(row), subscriptions);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const final = job.attempts >= REMINDER_LIMITS.deliveryAttempts;
      await deps.reminders.settle(userId, row.id, {
        status: final ? "failed" : "pending",
        attempts: job.attempts,
        error: text.slice(0, 500),
      });
      throw error;
    }
    await deps.reminders.settle(userId, row.id, {
      status: "delivered",
      attempts: job.attempts,
      error: null,
    });
  };

async function store(
  deps: ReminderDependencies,
  day: { userId: string; date: string; timeZone: string },
  now: Date,
): Promise<ReminderRow | null> {
  const { userId, date, timeZone } = day;
  const settings = await deps.reminders.settings(userId);
  const items = bundleOf(await deps.source.occasions(userId, timeZone, now), settings, date);
  const { row } = await deps.reminders.create(
    userId,
    date,
    items ?? [],
    items === null ? "none" : "pending",
  );
  return row;
}
