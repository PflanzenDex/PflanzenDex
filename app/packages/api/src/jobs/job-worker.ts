import { randomUUID } from "node:crypto";
import {
  drainJobs,
  JOB_LIMITS,
  type JobHandlers,
  type JobQueue,
  type RunOutcome,
} from "@pflanzendex/core";

export interface JobWorkerOptions {
  readonly queue: JobQueue;
  readonly handlers: JobHandlers;
  /** Pause between two checks of an empty queue (assumption: 5 s). */
  readonly intervalMs?: number;
  readonly now?: () => Date;
  readonly workerId?: string;
  /** Called for every run that did not succeed, and for queue errors; the default writes to stderr (P-10). */
  readonly report?: (
    event: RunOutcome | { readonly kind: "error"; readonly error: unknown },
  ) => void;
}

export interface JobWorker {
  /** Runs every due job once, then purges old finished jobs about once an hour. Exposed for tests. */
  tick(): Promise<RunOutcome[]>;
  start(): void;
  /** Stops polling and waits for the job in progress. */
  stop(): Promise<void>;
}

const PURGE_EVERY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const logToStderr: NonNullable<JobWorkerOptions["report"]> = (event) => {
  if (event.kind === "error") console.error("job queue error", event.error);
  else if (event.kind === "retry" || event.kind === "dead")
    console.error(`job ${event.job.type} ${event.job.id} ${event.kind}: ${event.error}`);
};

/**
 * Runs the jobs of the queue in the API process (TE-06, one deployable). One tick drains the due jobs; a failing job
 * is retried by the runner with backoff, a failing queue (database down) is reported and tried again at the next
 * tick, so the loop never dies. Several API processes may run workers at once: the queue hands out each job once.
 */
export function createJobWorker(options: JobWorkerOptions): JobWorker {
  const now = options.now ?? (() => new Date());
  const report = options.report ?? logToStderr;
  const runner = {
    queue: options.queue,
    handlers: options.handlers,
    now,
    workerId: options.workerId ?? `api-${randomUUID()}`,
  };
  let lastPurge = 0;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<unknown> = Promise.resolve();
  let stopped = true;

  async function tick(): Promise<RunOutcome[]> {
    const outcomes = await drainJobs(runner);
    for (const outcome of outcomes) report(outcome);
    const t = now().getTime();
    if (t - lastPurge >= PURGE_EVERY_MS) {
      lastPurge = t;
      await options.queue.purge(new Date(t - JOB_LIMITS.retentionDays * DAY_MS));
    }
    return outcomes;
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      running = tick()
        .catch((error: unknown) => report({ kind: "error", error }))
        .finally(schedule);
    }, options.intervalMs ?? 5000);
  }

  return {
    tick,
    start() {
      if (!stopped) return;
      stopped = false;
      schedule();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
