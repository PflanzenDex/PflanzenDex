import { nextRetryAt } from "./retry";
import { JOB_LIMITS, type JobQueue, type JobRow } from "./types";

/** Handlers must be repeatable: the same job run twice gives the same result (US-QS-03). Throwing means "failed". */
export type JobHandler = (job: JobRow, now: Date) => Promise<void>;
export type JobHandlers = Readonly<Record<string, JobHandler>>;

export interface RunnerDependencies {
  readonly queue: JobQueue;
  readonly handlers: JobHandlers;
  readonly now: () => Date;
  /** Identifies this worker in the lease; must differ between concurrently running workers. */
  readonly workerId: string;
  readonly leaseMs?: number;
}

export type RunOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "succeeded"; readonly job: JobRow }
  | { readonly kind: "retry"; readonly job: JobRow; readonly retryAt: Date; readonly error: string }
  | { readonly kind: "dead"; readonly job: JobRow; readonly error: string };

const messageOf = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, JOB_LIMITS.errorMax) || "unknown error";

/** Runs the next due job, if any. A failure is recorded and scheduled for retry; nothing is swallowed (P-10). */
export async function runNext(deps: RunnerDependencies): Promise<RunOutcome> {
  const job = await deps.queue.claim(deps.workerId, deps.now(), deps.leaseMs ?? JOB_LIMITS.leaseMs);
  if (job === null) return { kind: "idle" };
  const handler = deps.handlers[job.type];
  try {
    if (handler === undefined) throw new Error(`no handler for job type ${job.type}`);
    await handler(job, deps.now());
  } catch (e) {
    const error = messageOf(e);
    const now = deps.now();
    // A job without a handler can never succeed by waiting: no retry.
    const retryAt = handler === undefined ? null : nextRetryAt(job.attempts, job.maxAttempts, now);
    await deps.queue.fail(job.id, deps.workerId, now, { error, retryAt });
    return retryAt === null ? { kind: "dead", job, error } : { kind: "retry", job, retryAt, error };
  }
  await deps.queue.succeed(job.id, deps.workerId, deps.now());
  return { kind: "succeeded", job };
}

/** Runs due jobs one after the other until none is left or `limit` is reached; returns what happened. */
export async function drainJobs(deps: RunnerDependencies, limit = 100): Promise<RunOutcome[]> {
  const outcomes: RunOutcome[] = [];
  while (outcomes.length < limit) {
    const outcome = await runNext(deps);
    if (outcome.kind === "idle") break;
    outcomes.push(outcome);
  }
  return outcomes;
}
