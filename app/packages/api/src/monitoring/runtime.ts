import {
  REMINDER_JOB_TYPE,
  scheduleReminders,
  sendRemindersHandler,
  type JobHandlers,
  type OccasionSource,
  type ReminderChannel,
  type ReminderMessage,
} from "@pflanzendex/core";
import { ChannelsPostgres, JobsPostgres, RemindersPostgres, RosterPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";
import { WebPushReminderChannel } from "./push/web-push-channel";
import { webPushConfigFromEnv, webPushSender } from "./push/web-push-config";

/**
 * The delivery channel while the operator has not set up web push (local development, or VAPID keys missing): it sends
 * nothing out and says so in the log. A reminder is stored in the in-app inbox before any send, so nothing is lost
 * meanwhile (P-10). Email (E-10) is not built yet.
 */
export class StubReminderChannel implements ReminderChannel {
  constructor(private readonly log: (line: string) => void = console.info) {}

  async send(userId: string, message: ReminderMessage): Promise<void> {
    this.log(
      `reminder (stub, nothing sent): account ${userId}, ${message.items.length} item(s), "${message.body}"`,
    );
  }
}

/**
 * The channel the server composes (ADR 0015): Web Push when `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
 * are set; the stub when none is set. A partial or invalid configuration keeps the stub and names what is wrong, so the
 * API still starts and the reminders stay in the inbox (P-10).
 */
export function reminderChannelFromEnv(
  pool: Pool,
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = console.warn,
): ReminderChannel {
  const config = webPushConfigFromEnv(env);
  if (config === null) return new StubReminderChannel();
  if ("length" in config) {
    log(`Web push is off, reminders stay in the inbox: ${config.join(", ")} missing or invalid.`);
    return new StubReminderChannel();
  }
  return new WebPushReminderChannel({
    send: webPushSender(config),
    channels: new ChannelsPostgres(pool),
    log,
  });
}

export interface RemindersRuntimeOptions {
  /** Owner pool: the job queue and the roster need it (TE-06). */
  readonly pool: Pool;
  /** What needs action, from the central status function (FR-MON-03); the app root composes it. */
  readonly source: OccasionSource;
  readonly channel?: ReminderChannel;
}

/**
 * The background side of the reminders (US-MON-01): the handler of the job `monitoring.send_reminders` for the job
 * worker, and `tick`, which orders the due checks (one job per account and local day) and is meant to run every few
 * minutes. Composed in `main.ts` next to the other job handlers.
 */
export function remindersRuntime(options: RemindersRuntimeOptions): {
  handlers: JobHandlers;
  tick: (now: Date) => Promise<number>;
} {
  const { pool } = options;
  const reminders = new RemindersPostgres(pool);
  return {
    handlers: {
      [REMINDER_JOB_TYPE]: sendRemindersHandler({
        reminders,
        channels: new ChannelsPostgres(pool),
        source: options.source,
        channel: options.channel ?? new StubReminderChannel(),
      }),
    },
    tick: (now) =>
      scheduleReminders(
        { roster: new RosterPostgres(pool), reminders, queue: new JobsPostgres(pool) },
        now,
      ),
  };
}
