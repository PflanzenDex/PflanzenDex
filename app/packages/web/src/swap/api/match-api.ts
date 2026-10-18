import type { MatchCard, MatchYesResult } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** The deck: cards without an answer, and the cards answered with "Später" (US-TAU-02). */
export interface DeckData {
  readonly cards: readonly MatchCard[];
  readonly later: readonly MatchCard[];
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
): Promise<Response<unknown>> {
  return createWrite(api, token)("PUT", `/exchange/match/${encodeURIComponent(offerId)}/answer`, {
    answer,
    timeZone: currentTimeZone(),
  });
}

/** "Rückgängig" after Nein or Später: takes the stored answer back, the card is open again. */
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
