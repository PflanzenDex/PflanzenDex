// Pure rules for external sources (NFR-17). Numbers are starting values (assumption, decided by the PO), except
// the retry limits that the issue fixes: at most 5 attempts, backoff of at most 60 s on 429/5xx.
import type { ErrorCode } from "../error";
import type { SourceName } from "./types";

export const SOURCE_POLICY = {
  maxAttempts: 5,
  maxBackoffMs: 60_000,
  baseBackoffMs: 1_000,
  timeoutMs: 10_000,
  foundTtlMs: 7 * 24 * 3_600_000,
  notFoundTtlMs: 24 * 3_600_000,
  /** Minimum distance between two requests to the same source (throttling). */
  minIntervalMs: { wikipedia: 200, wikidata: 200, gbif: 100, opentree: 500 } satisfies Record<
    SourceName,
    number
  >,
} as const;

export type StatusClass = "ok" | "not_found" | "retry" | "rejected";

export function classifyStatus(status: number): StatusClass {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404) return "not_found";
  if (status === 429 || status >= 500) return "retry";
  return "rejected";
}

/** Wait before the next attempt; `failedAttempt` counts from 1. A server hint (Retry-After) wins but is capped. */
export function backoffDelayMs(failedAttempt: number, retryAfterMs?: number): number {
  const exponential = SOURCE_POLICY.baseBackoffMs * 2 ** (failedAttempt - 1);
  const wanted = retryAfterMs !== undefined && retryAfterMs >= 0 ? retryAfterMs : exponential;
  return Math.min(SOURCE_POLICY.maxBackoffMs, wanted);
}

/** `Retry-After` as seconds or HTTP date; undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

/** Error code once the attempts are used up. */
export function exhaustedCode(lastStatus: number | "timeout" | "network"): ErrorCode {
  if (lastStatus === "timeout") return "source.timeout";
  return lastStatus === 429 ? "source.rate_limited" : "source.unavailable";
}
