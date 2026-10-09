import type { ExchangeOffer, OfferType } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../kernel";
import type { OwnSpecimenRow } from "./offers-api";

type FetchFn = typeof fetch;

export interface ExchangeFilters {
  readonly type: OfferType | "";
  readonly lack: boolean;
}

/** What the list of friends' offers shows: the offers and my own shared specimens for a counter-offer (US-SOZ-09). */
export interface FriendOffersData {
  readonly offers: readonly ExchangeOffer[];
  /** My active specimens that I share with friends: only these can be a counter-offer. */
  readonly counterChoices: readonly Pick<OwnSpecimenRow, "id" | "name">[];
}

/** Loads the open offers of friends (filtered) and my shared specimens; the first refusal wins (P-10). */
export async function loadFriendOffers(
  api: string,
  token: string,
  filters: ExchangeFilters,
  fetchFn: FetchFn = fetch,
): Promise<Response<FriendOffersData>> {
  const query = new URLSearchParams({ timeZone: currentTimeZone() });
  if (filters.type) query.set("type", filters.type);
  if (filters.lack) query.set("lack", "true");
  const [offers, specimens, shared] = await Promise.all([
    call<{ offers: readonly ExchangeOffer[] }>(fetchFn, `${api}/exchange/offers?${query}`, token),
    call<{ specimens: readonly OwnSpecimenRow[] }>(fetchFn, `${api}/specimens`, token),
    call<{ shared: readonly { specimenId: string }[] }>(fetchFn, `${api}/sharing`, token),
  ]);
  if (!offers.ok) return offers;
  if (!specimens.ok) return specimens;
  if (!shared.ok) return shared;
  const ids = new Set(shared.value.shared.map((s) => s.specimenId));
  return {
    ok: true,
    value: {
      offers: offers.value.offers,
      counterChoices: specimens.value.specimens.filter(
        (s) => s.status !== "archived" && ids.has(s.id),
      ),
    },
  };
}

export interface RequestInput {
  counterSpecimenId?: string;
  counterText?: string;
}

/** Requests an offer of a friend (US-SOZ-09); the repeat-guard key is created per call. */
export async function requestOffer(
  access: { api: string; token: string; fetchFn?: FetchFn },
  offerId: string,
  input: RequestInput,
): Promise<Response<{ swapId: string }>> {
  const r = await createWrite(access.api, access.token, access.fetchFn ?? fetch)(
    "POST",
    `/offers/${encodeURIComponent(offerId)}/request`,
    input,
  );
  return r.ok ? { ok: true, value: r.value as { swapId: string } } : r;
}
