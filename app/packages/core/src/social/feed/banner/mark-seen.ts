import { appError, defineOperation, failed, ok, shape, type ErrorDetail } from "../../../kernel";
import type { FeedSeenStore } from "./types";

export interface FeedMarkSeenDependencies {
  readonly seen: FeedSeenStore;
}

const instant = (field: string) => (value: unknown) =>
  typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : ({ field, code: "input.invalid" } as ErrorDetail);

/**
 * "Okay" on the banner and the silent creation of the first visit (US-SOZ-06, P-03): marks the feed as seen up to the
 * instant the banner was read (`asOf`), so what became visible after that is still new. The state only moves forward, and
 * never past now; repeating the call changes nothing. It belongs to the account of the caller alone (P-04).
 */
export const feedMarkSeen = (deps: FeedMarkSeenDependencies) =>
  defineOperation<{ upTo: string }, { seenAt: string }>({
    name: "feed.mark_seen",
    schema: shape({ upTo: instant("upTo") }),
    run: async ({ userId }, input) => {
      const seenAt = await deps.seen.markSeen(userId, input.upTo);
      return seenAt ? ok({ seenAt }) : failed(appError("system.unexpected"));
    },
  });
