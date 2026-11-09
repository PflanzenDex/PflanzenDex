import type { DecideResult, SuggestionDeck, UndoDecisionResult } from "@pflanzendex/core";
import {
  call,
  currentTimeZone,
  type Response,
  type WriteOptions,
  writeFor,
} from "../../shared/data";

/** Loads deck `deck` of the suggestions (US-ENT-01), optionally only for light zone `zone` (US-ENT-07): derived on every request, in the zone of the profile (NFR-08). */
export function loadSuggestions(
  api: string,
  token: string,
  query: { deck: number; zone?: number },
  fetchFn: typeof fetch = fetch,
): Promise<Response<SuggestionDeck>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  const { deck, zone } = query;
  const filter = zone === undefined ? "" : `&zone=${zone}`;
  return call<SuggestionDeck>(
    fetchFn,
    `${api}/discover/suggestions?timeZone=${timeZone}&deck=${deck}${filter}`,
    token,
  );
}

/** "Ja" or "Nein" on a card (US-ENT-04): written at once as a wish; the server derives the wish from the species itself. */
export async function decideSuggestion(
  api: string,
  token: string,
  choice: { species: string; decision: "yes" | "no" },
  options: WriteOptions = {},
): Promise<Response<DecideResult>> {
  const r = await writeFor(api, token, options)("POST", "/discover/decisions", {
    ...choice,
    timeZone: currentTimeZone(),
  });
  return r.ok ? { ok: true, value: r.value as DecideResult } : r;
}

/** "Rückgängig" on a card (US-ENT-04): the server takes back the account's last Yes or No, and only that one. */
export async function undoSuggestionDecision(
  api: string,
  token: string,
  species: string,
  options: WriteOptions = {},
): Promise<Response<UndoDecisionResult>> {
  const r = await writeFor(api, token, options)("POST", "/discover/decisions/undo", { species });
  return r.ok ? { ok: true, value: r.value as UndoDecisionResult } : r;
}
