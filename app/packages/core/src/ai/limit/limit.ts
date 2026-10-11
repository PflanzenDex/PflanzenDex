// Rate limit per connection and day (US-KI-06, FR-KI-11): the interface stays usable for the keeper's forms (FR-KI-05);
// only the AI client is told to wait. Calls are measured from the log of AI actions (DM-KI-04).
import { appError, failed, ok, type Result } from "../../kernel";
import type { AiLogStore } from "../status";

/** Calls per connection and UTC day (starting value, assumption decided by the PO; adjustable per deployment). */
export const DEFAULT_DAILY_LIMIT = 500;

/** The start of the UTC day of `now` and of the next one (when the client may call again). */
export function dayWindow(now: Date): { start: Date; next: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, next: new Date(start.getTime() + 86_400_000) };
}

/** `ai.rate_limited` once the connection used its calls of the UTC day; `retryAt` says when it may call again. */
export async function checkDailyLimit(
  log: Pick<AiLogStore, "countSince">,
  call: { userId: string; connectionId: string; now: Date; limit: number },
): Promise<Result<{ used: number }> & { retryAt?: Date }> {
  const { start, next } = dayWindow(call.now);
  const used = await log.countSince(call.userId, call.connectionId, start);
  return used >= call.limit
    ? { ...failed(appError("ai.rate_limited")), retryAt: next }
    : ok({ used });
}
