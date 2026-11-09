import type {
  OfferMode,
  OfferPreview,
  OfferRow,
  OfferType,
  OfferView,
  SpecimenRow,
} from "@pflanzendex/core";
import {
  call,
  currentTimeZone,
  type Response,
  type WriteOptions,
  writeFor,
} from "../../shared/data";

type FetchFn = typeof fetch;

export type OwnSpecimenRow = Pick<SpecimenRow, "id" | "name" | "status">;

/** What the exchange page shows: my offers and my specimens to offer, loaded together (P-10). */
export interface ExchangeData {
  readonly offers: readonly OfferView[];
  readonly specimens: readonly OwnSpecimenRow[];
}

/** Loads my offers (with health details and phase) and my specimens in parallel; the first refusal wins. */
export async function loadExchange(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<ExchangeData>> {
  const zone = encodeURIComponent(currentTimeZone());
  const [offers, specimens] = await Promise.all([
    call<{ offers: readonly OfferView[] }>(fetchFn, `${api}/offers?timeZone=${zone}`, token),
    call<{ specimens: readonly OwnSpecimenRow[] }>(fetchFn, `${api}/specimens`, token),
  ]);
  if (!offers.ok) return offers;
  if (!specimens.ok) return specimens;
  return { ok: true, value: { offers: offers.value.offers, specimens: specimens.value.specimens } };
}

/** What the dialog shows for one specimen before anything is written (US-SOZ-08). */
export function loadPreview(
  api: string,
  token: string,
  specimenId: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<OfferPreview>> {
  const zone = encodeURIComponent(currentTimeZone());
  return call<OfferPreview>(
    fetchFn,
    `${api}/offers/preview?specimenId=${encodeURIComponent(specimenId)}&timeZone=${zone}`,
    token,
  );
}

export interface OfferInput {
  specimenId: string;
  type: OfferType;
  mode: OfferMode;
  wish?: string;
  note?: string;
  confirmTreatment?: boolean;
}

/** Creates an offer (US-SOZ-08); the repeat-guard key is the action's (`options.key`), else made per call. */
export async function createOffer(
  api: string,
  token: string,
  input: OfferInput,
  options: WriteOptions = {},
): Promise<Response<OfferRow>> {
  const r = await writeFor(api, token, options)("POST", "/offers", input);
  return r.ok ? { ok: true, value: r.value as OfferRow } : r;
}

/** Withdraws an offer at any time while it is open or reserved (US-SOZ-08). */
export async function withdrawOffer(
  api: string,
  token: string,
  offerId: string,
  options: WriteOptions = {},
): Promise<Response<OfferRow>> {
  const r = await writeFor(api, token, options)(
    "POST",
    `/offers/${encodeURIComponent(offerId)}/withdraw`,
    {},
  );
  return r.ok ? { ok: true, value: r.value as OfferRow } : r;
}

/** Shares one specimen with friends so it can be offered (the dialog offers it when it is private, US-SOZ-04). */
export async function shareSpecimen(
  api: string,
  token: string,
  specimenId: string,
  options: WriteOptions = {},
): Promise<Response<unknown>> {
  return writeFor(api, token, options)(
    "PUT",
    `/sharing/specimens/${encodeURIComponent(specimenId)}`,
    {
      share: "friends",
    },
  );
}
