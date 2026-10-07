import type { SuggestionDeck } from "@pflanzendex/core";
import { call, currentTimeZone, type Response } from "../../kernel";

/** Loads deck `deck` of the suggestions (US-ENT-01): derived on every request, in the zone of the profile (NFR-08). */
export function loadSuggestions(
  api: string,
  token: string,
  deck: number,
  fetchFn: typeof fetch = fetch,
): Promise<Response<SuggestionDeck>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  return call<SuggestionDeck>(
    fetchFn,
    `${api}/discover/suggestions?timeZone=${timeZone}&deck=${deck}`,
    token,
  );
}
