import { JOB_LIMITS } from "./types";

/** Delay before the next try after `attempts` failed runs (1 = the first run failed): doubling, capped (assumption). */
export function retryDelayMs(attempts: number): number {
  const { baseMs, capMs } = JOB_LIMITS.backoff;
  const exponent = Math.max(0, Math.min(attempts - 1, 30));
  return Math.min(baseMs * 2 ** exponent, capMs);
}

/** When to run a job again, or `null` when no attempts are left (the job is then dead and stays visible, P-10). */
export function nextRetryAt(attempts: number, maxAttempts: number, now: Date): Date | null {
  return attempts >= maxAttempts ? null : new Date(now.getTime() + retryDelayMs(attempts));
}
