import { QueryClient } from "@tanstack/react-query";
import type { ApiError } from "../api";

/** A failed request with its API error, so the view can show the German text of the code (FR-QG-11, P-10). */
export class RequestFailure extends Error {
  constructor(readonly error: ApiError) {
    super(error.code);
  }
}

export const NETWORK_DOWN = "network.not_reachable";

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
