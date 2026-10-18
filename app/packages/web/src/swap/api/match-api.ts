import type { MatchCard, MatchEntry, MatchYesResult } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** The deck: the cards to decide now and every stored answer with the state of its offer (US-TAU-02, US-TAU-06). */
export interface DeckData {
  readonly cards: readonly MatchCard[];
  readonly entries: readonly MatchEntry[];
}

/** The match deck (US-TAU-01): open offers of friends whose species is on the own wishlist, derived on every request. */
export async function loadMatchDeck(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<DeckData>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  return call<DeckData>(fetchFn, `${api}/exchange/match?timeZone=${timeZone}`, token);
}

/** "Nein" or "Später" on a card (US-TAU-02): stored privately for this account, the giver learns nothing (FR-TAU-02). */
export async function saveAnswer(
  api: string,
  token: string,
  offerId: string,
  answer: "no" | "later",
): Promise<Response<{ answeredOn: string }>> {
  const r = await createWrite(api, token)(
    "PUT",
    `/exchange/match/${encodeURIComponent(offerId)}/answer`,
    { answer, timeZone: currentTimeZone() },
  );
  return r.ok ? { ok: true, value: r.value as { answeredOn: string } } : r;
}

/** "Rückgängig" after Nein or Später, "Wieder ansehen" and "Aus der Liste entfernen" (US-TAU-06): takes the stored answer back. */
export async function undoAnswer(
  api: string,
  token: string,
  offerId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<unknown>> {
  return createWrite(
    api,
    token,
    fetchFn,
  )("DELETE", `/exchange/match/${encodeURIComponent(offerId)}/answer`);
}

/** "Ja" on a card (US-TAU-03): the swap request of US-SOZ-09; asking twice answers `already_requested`. */
export async function answerYes(
  api: string,
  token: string,
  offerId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<MatchYesResult>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/exchange/match/${encodeURIComponent(offerId)}/yes`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as MatchYesResult } : r;
}
