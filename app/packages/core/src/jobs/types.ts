// Job queue (TE-06, US-QS-03). `core` defines the port and the rules; the PostgreSQL adapter lives in `db`, the runner
// loop in `api` (AB-1, ADR 0003). A job is a durable, repeatable piece of work for slow or external effects: reminders
// (MON), the catalog build (POK), photo processing (WAC), AI orders (KI).

/**
 * Limits and defaults are assumptions (starting values); the database checks the same bounds.
 * `leaseMs`: how long a worker owns a running job before another worker may take it over (a crashed worker).
 */
export const JOB_LIMITS = {
  type: { min: 3, max: 80 },
  dedupeKey: { min: 1, max: 200 },
  /** Serialized payload, in characters. */
  payloadMax: 8000,
  maxAttempts: { min: 1, max: 20, default: 5 },
  leaseMs: 5 * 60 * 1000,
  /** Backoff: base delay doubled per failed attempt, capped. */
  backoff: { baseMs: 30 * 1000, capMs: 60 * 60 * 1000 },
  errorMax: 500,
  /** Finished jobs are kept this long for diagnosis, then purged. */
  retentionDays: 30,
} as const;

export const JOB_STATUS = ["queued", "running", "succeeded", "dead", "expired"] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export type JsonObject = { readonly [key: string]: unknown };

/** What is stored of a job. `payload` carries references (ids), never copies of user data (P-05). */
export interface JobRow {
  readonly id: string;
  /** `<module>.<job>`, e.g. `monitoring.send_reminder`. */
  readonly type: string;
  /** Open jobs with the same type and key are merged: repeating an order is idempotent (US-QS-03). */
  readonly dedupeKey: string | null;
  readonly payload: JsonObject;
  readonly status: JobStatus;
  /** Number of runs started so far. */
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly runAt: Date;
  /** After this time a job that has not started is dropped as `expired` (never run late, P-10: it stays visible). */
  readonly expiresAt: Date | null;
  readonly lastError: string | null;
}

export interface NewJob {
  readonly type: string;
  readonly dedupeKey: string | null;
  readonly payload: JsonObject;
  readonly runAt: Date;
  readonly expiresAt: Date | null;
  readonly maxAttempts: number;
}

/** How a run ended badly: the error to keep and when to try again (`null` = never, the job is dead). */
export interface JobFailure {
  readonly error: string;
  readonly retryAt: Date | null;
}

/**
 * Port of the job queue. Adapters make `enqueue` and `claim` atomic: of two concurrent workers exactly one gets a job,
 * of two concurrent enqueues with the same open (type, dedupe key) exactly one creates it. Time always comes in as
 * `now` (no clock inside). Contract test: `queue.contract.test.ts`.
 */
export interface JobQueue {
  /** `created: false` returns the already open job with the same type and dedupe key and changes nothing. */
  enqueue(job: NewJob): Promise<{ readonly job: JobRow; readonly created: boolean }>;
  /**
   * Hands the next due job to `workerId` for `leaseMs` and counts the attempt. Due: queued with `runAt <= now`, or
   * running with an expired lease (the worker vanished). Jobs past `expiresAt` become `expired`, a lost job with no
   * attempts left becomes `dead`; neither is handed out. `null` when nothing is due.
   */
  claim(workerId: string, now: Date, leaseMs: number): Promise<JobRow | null>;
  /** `false` when the job is no longer owned by `workerId` (lease lost); the result is then ignored. */
  succeed(id: string, workerId: string, now: Date): Promise<boolean>;
  /** Queues a retry at `retryAt`, or makes the job `dead` when `retryAt` is `null`. `false` as for `succeed`. */
  fail(id: string, workerId: string, now: Date, failure: JobFailure): Promise<boolean>;
  /** Number of jobs per status, for the health view and monitoring. */
  counts(): Promise<Readonly<Record<JobStatus, number>>>;
  /** Deletes finished jobs (succeeded, dead, expired) that ended before `before`; returns how many. */
  purge(before: Date): Promise<number>;
}
