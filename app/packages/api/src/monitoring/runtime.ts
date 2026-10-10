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

/**
 * The delivery channel until real sending exists (E-10 decided: web push plus optional email): it sends nothing out and
 * says so in the log. The real adapter needs a VAPID key pair for web push and an SMTP account for email; both are
 * tasks of the operator (docs/specs/product/09-reminders-and-sensors.md) and are not built yet. A reminder is stored in
 * the in-app inbox before any send, so nothing is lost meanwhile (P-10).
 */
export class StubReminderChannel implements ReminderChannel {
  constructor(private readonly log: (line: string) => void = console.info) {}

  async send(userId: string, message: ReminderMessage): Promise<void> {
    this.log(
      `reminder (stub, nothing sent): account ${userId}, ${message.items.length} item(s), "${message.body}"`,
    );
  }
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
