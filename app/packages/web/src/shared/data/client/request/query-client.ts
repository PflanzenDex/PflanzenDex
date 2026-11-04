import { QueryClient } from "@tanstack/react-query";
import type { ApiError } from "../../api";

/** A failed request with its API error, so the view can show the German text of the code (FR-QG-11, P-10). */
export class RequestFailure extends Error {
  constructor(readonly error: ApiError) {
    super(error.code);
  }
}

export const NETWORK_DOWN = "network.not_reachable";

/**
 * How long reference data counts as fresh (species, locations, light zones, unlocks; issue 1244): a copy inside this
 * window is shown without a request, so going back to a screen does not ask again. The account's own writes refresh
 * the copies at once (`useInvalidate`, `loadShared` callers invalidate their key); a change made elsewhere (the shared
 * catalog, another device) shows after the window. Starting value (assumption): 5 minutes.
 */
export const REFERENCE_STALE_TIME = 5 * 60_000;

/**
 * The one cache for server state (DS-09, ADR 0006). Requests run even when the browser reports "offline", so the
 * failure is a visible `network.not_reachable` and the last loaded data stays on screen (US-QS-07). No automatic
 * retries: the user decides with "Erneut versuchen". Data of an earlier session never survives sign-out (P-04).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "always", refetchOnWindowFocus: false },
      mutations: { networkMode: "always" },
    },
  });
}
