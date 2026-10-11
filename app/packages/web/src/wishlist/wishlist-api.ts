import type {
  BoughtList,
  CandidateList,
  DiscardedList,
  WishBuyResult,
  WishDiscardResult,
  WishLinkResult,
  WishRemoveResult,
  WishRenameResult,
  WishRow,
} from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

/** Loads the open candidates sorted by space need (US-WUN-01); derived on every request, never stored. */
function loadCandidates(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<CandidateList>> {
  return call<CandidateList>(fetchFn, `${api}/wishes/candidates`, token);
}

/** The page data: the open candidates, the bought (US-WUN-03) and the discarded wishes (US-WUN-05), loaded together so the page has one state. */
export interface Wishlist {
  readonly list: CandidateList;
  readonly bought: BoughtList;
  readonly discarded: DiscardedList;
}

/** Loads candidates, bought and discarded wishes in parallel; the first refusal wins, nothing is shown half (P-10). */
export async function loadWishlist(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Wishlist>> {
  const [list, bought, discarded] = await Promise.all([
    loadCandidates(api, token, fetchFn),
    call<BoughtList>(fetchFn, `${api}/wishes/bought`, token),
    call<DiscardedList>(fetchFn, `${api}/wishes/discarded`, token),
  ]);
  if (!list.ok) return list;
  if (!bought.ok) return bought;
  if (!discarded.ok) return discarded;
  return {
    ok: true,
    value: { list: list.value, bought: bought.value, discarded: discarded.value },
  };
}

/** "Gekauft" (US-WUN-03): marks an open wish as bought; the answer says what happened and what comes next. */
export async function buyWish(
  api: string,
  token: string,
  wishId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<WishBuyResult>> {
  const r = await createWrite(
    api,
    token,
    fetchFn,
  )("POST", `/wishes/${encodeURIComponent(wishId)}/buy`);
  return r.ok ? { ok: true, value: r.value as WishBuyResult } : r;
}

/** "Verwerfen" (US-WUN-05): sets an open wish to discarded; it is kept and listed under "Verworfen" (P-10). */
export async function discardWish(
  api: string,
  token: string,
  wishId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<WishDiscardResult>> {
  const r = await createWrite(
    api,
    token,
    fetchFn,
  )("POST", `/wishes/${encodeURIComponent(wishId)}/discard`);
  return r.ok ? { ok: true, value: r.value as WishDiscardResult } : r;
}

/** Links a bought wish to the specimen it became (US-WUN-05, "bought → specimen"). */
export async function linkWishSpecimen(
  api: string,
  token: string,
  target: { wishId: string; specimenId: string },
  fetchFn: typeof fetch = fetch,
): Promise<Response<WishLinkResult>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/wishes/${encodeURIComponent(target.wishId)}/specimen`,
    { specimenId: target.specimenId },
  );
  return r.ok ? { ok: true, value: r.value as WishLinkResult } : r;
}

export interface WishInput {
  name: string;
  german?: string;
  targetZoneId?: string;
  difficulty?: number;
  reasoning?: string;
  imageUrl?: string;
  imageSource?: string;
}

/** Records a wish (FR-WUN-01). The repeat-guard key is created per call, so a double tap writes once. */
export async function createWish(
  api: string,
  token: string,
  input: WishInput,
  fetchFn: typeof fetch = fetch,
): Promise<Response<WishRow>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/wishes", input);
  return r.ok ? { ok: true, value: (r.value as { wish: WishRow }).wish } : r;
}

/** Renames a wish that shares its name with another one (FR-WUN-06, #303); the server sets its key or refuses. */
export async function renameWish(
  api: string,
  token: string,
  target: { wishId: string; name: string },
  fetchFn: typeof fetch = fetch,
): Promise<Response<WishRenameResult>> {
  const r = await createWrite(api, token, fetchFn)(
    "POST",
    `/wishes/${encodeURIComponent(target.wishId)}/rename`,
    { name: target.name },
  );
  return r.ok ? { ok: true, value: r.value as WishRenameResult } : r;
}

/** Deletes a wish that shares its name with another one (FR-WUN-06, #303); any other wish is refused. */
export async function removeDuplicateWish(
  api: string,
  token: string,
  wishId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<WishRemoveResult>> {
  const r = await createWrite(
    api,
    token,
    fetchFn,
  )("POST", `/wishes/${encodeURIComponent(wishId)}/remove-duplicate`);
  return r.ok ? { ok: true, value: r.value as WishRemoveResult } : r;
}

/** "Bild speichern" (US-WUN-04): stores a local copy of the wish image from Wikimedia Commons with source and license. */
export async function storeWishImage(
  api: string,
  token: string,
  wishId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<{ changed: boolean }>> {
  const r = await createWrite(
    api,
    token,
    fetchFn,
  )("POST", `/wishes/${encodeURIComponent(wishId)}/image`);
  return r.ok ? { ok: true, value: r.value as { changed: boolean } } : r;
}
