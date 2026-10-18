import type { MatchCard, MatchYesResult } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** The match deck (US-TAU-01): open offers of friends whose species is on the own wishlist, derived on every request. */
export async function loadMatchDeck(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly MatchCard[]>> {
  const timeZone = encodeURIComponent(currentTimeZone());
  const r = await call<{ cards: readonly MatchCard[] }>(
    fetchFn,
    `${api}/exchange/match?timeZone=${timeZone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.cards } : r;
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
