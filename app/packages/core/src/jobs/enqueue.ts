import { appError, failed, ok, type ErrorDetail, type Result } from "../kernel";
import { JOB_LIMITS, type JobQueue, type JobRow, type JsonObject } from "./types";

const TYPE_FORMAT = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export interface EnqueueInput {
  readonly type: string;
  /** Merges repeated orders for the same thing, e.g. the specimen id (US-QS-03). */
  readonly dedupeKey?: string;
  readonly payload?: JsonObject;
  /** Default: now. */
  readonly runAt?: Date;
  readonly expiresAt?: Date;
  readonly maxAttempts?: number;
}

export interface EnqueueDependencies {
  readonly queue: JobQueue;
  readonly now: () => Date;
}

const inRange = (n: number, r: { min: number; max: number }) =>
  Number.isInteger(n) && n >= r.min && n <= r.max;

function problems(input: EnqueueInput, now: Date): ErrorDetail[] {
  const { type, dedupeKey, payload, expiresAt, maxAttempts } = input;
  const tooLate = expiresAt !== undefined && expiresAt.getTime() <= (input.runAt ?? now).getTime();
  const checks: [string, boolean][] = [
    ["type", !inRange(type.length, JOB_LIMITS.type) || !TYPE_FORMAT.test(type)],
    ["dedupeKey", dedupeKey !== undefined && !inRange(dedupeKey.length, JOB_LIMITS.dedupeKey)],
    ["maxAttempts", maxAttempts !== undefined && !inRange(maxAttempts, JOB_LIMITS.maxAttempts)],
    ["payload", payload !== undefined && JSON.stringify(payload).length > JOB_LIMITS.payloadMax],
    ["expiresAt", tooLate],
  ];
  return checks.filter(([, bad]) => bad).map(([field]) => ({ field, code: "input.invalid" }));
}

/**
 * Orders a background job. Invalid input queues nothing; an open job with the same type and dedupe key is returned
 * instead of a second one (`created: false`, US-QS-03). The payload holds ids, not user data (P-05).
 */
export async function enqueueJob(
  deps: EnqueueDependencies,
  input: EnqueueInput,
): Promise<Result<{ readonly job: JobRow; readonly created: boolean }>> {
  const now = deps.now();
  const details = problems(input, now);
  if (details.length > 0) return failed(appError("input.invalid", { details }));
  return ok(
    await deps.queue.enqueue({
      type: input.type,
      dedupeKey: input.dedupeKey ?? null,
      payload: input.payload ?? {},
      runAt: input.runAt ?? now,
      expiresAt: input.expiresAt ?? null,
      maxAttempts: input.maxAttempts ?? JOB_LIMITS.maxAttempts.default,
    }),
  );
}
