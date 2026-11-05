import type { CardPage, SpecimenCard, SpecimenSummary } from "@pflanzendex/core";
import { call, currentTimeZone, type Response } from "../../../shared/data";

type FetchFn = typeof fetch;

/** The filter of the card list: a location ID (`none` for plants without one) or a species ID; nothing means all plants. */
export type CardFilter = { location?: string; species?: string };

/**
 * One page of the cards (US-BES-06, FR-BES-23): `after` is the cursor of the page before, `limit` the size (the server
 * default is 100). The device's time zone decides "today" for the due dates (NFR-08).
 */
export async function loadCardPage(
  api: string,
  token: string,
  query: CardFilter & { after?: string; limit?: number } = {},
  fetchFn: FetchFn = fetch,
): Promise<Response<CardPage>> {
  const params = new URLSearchParams({ timeZone: currentTimeZone() });
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.after !== undefined) params.set("after", query.after);
  if (query.location !== undefined) params.set("location", query.location);
  if (query.species !== undefined) params.set("species", query.species);
  return call<CardPage>(fetchFn, `${api}/specimens/cards?${params}`, token);
}

/** The counts over all active plants (US-BES-06): the total, the groups by location, the unplaced ones and the last location. */
export async function loadCardSummary(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<SpecimenSummary>> {
  return call<SpecimenSummary>(fetchFn, `${api}/specimens/cards/summary`, token);
}

/** One active card by ID (US-LIC-02, US-BES-06); an unknown or foreign ID is `specimen.not_found`. */
export async function loadCard(
  api: string,
  token: string,
  id: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<SpecimenCard>> {
  const params = new URLSearchParams({ timeZone: currentTimeZone() });
  return call<SpecimenCard>(
    fetchFn,
    `${api}/specimens/${encodeURIComponent(id)}/card?${params}`,
    token,
  );
}

/**
 * Every active plant of one species (US-BES-03): the marker rule of the create form needs all of them, so the pages are
 * read to the end. A failed page fails the whole read (P-10).
 */
export async function loadAllCardsOf(
  api: string,
  token: string,
  speciesId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<SpecimenCard[]>> {
  const cards: SpecimenCard[] = [];
  let after: string | undefined;
  let more = true;
  while (more) {
    const r = await loadCardPage(
      api,
      token,
      { species: speciesId, limit: 200, ...(after === undefined ? {} : { after }) },
      fetchFn,
    );
    if (!r.ok) return r;
    cards.push(...r.value.cards);
    after = r.value.next ?? undefined;
    more = after !== undefined;
  }
  return { ok: true, value: cards };
}

/** How many active and archived specimens the account has (for the start page); one cheap count on the server. */
export async function loadSpecimenCount(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<{ active: number; archived: number }>> {
  const r = await call<{ count: number; archived?: number }>(
    fetchFn,
    `${api}/specimens/count`,
    token,
  );
  // An API from before #291 sends no `archived`: then the start page behaves as it did before (new account).
  return r.ok ? { ok: true, value: { active: r.value.count, archived: r.value.archived ?? 0 } } : r;
}
