import type { SourceCache, SourceOutcome } from "@pflanzendex/core";

/** In-memory cache with expiry (starting value; a shared cache can replace it behind the same port). */
export function createMemorySourceCache(now: () => number = Date.now): SourceCache {
  const entries = new Map<string, { outcome: SourceOutcome; expires: number }>();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.outcome;
    },
    async set(key, outcome, ttlMs) {
      entries.set(key, { outcome, expires: now() + ttlMs });
    },
  };
}
