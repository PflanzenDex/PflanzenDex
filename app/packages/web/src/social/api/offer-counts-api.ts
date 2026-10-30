import { call, currentTimeZone, type Response } from "../../kernel";

/** The count of the open offers of friends (US-SOZ-09): the same request as the list of the exchange, only its length is used. */
export async function loadOpenOffersCount(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<number>> {
  const query = new URLSearchParams({ timeZone: currentTimeZone() });
  const r = await call<{ offers: readonly unknown[] }>(
    fetchFn,
    `${api}/exchange/offers?${query}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.offers.length } : r;
}

/** The count of the offers that match the own wishlist and wait for an answer (US-TAU-01): the cards of the match deck. */
export async function loadMatchingCount(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<number>> {
  const query = new URLSearchParams({ timeZone: currentTimeZone() });
  const r = await call<{ cards: readonly unknown[] }>(
    fetchFn,
    `${api}/exchange/match?${query}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.cards.length } : r;
}
