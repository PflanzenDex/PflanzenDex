import type {
  BoughtList,
  CandidateList,
  WishBuyResult,
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

/** The page data: the open candidates and the bought wishes (US-WUN-03), loaded together so the page has one state. */
export interface Wishlist {
  readonly list: CandidateList;
  readonly bought: BoughtList;
}

/** Loads candidates and bought wishes in parallel; the first refusal wins, nothing is shown half (P-10). */
export async function loadWishlist(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<Wishlist>> {
  const [list, bought] = await Promise.all([
    loadCandidates(api, token, fetchFn),
    call<BoughtList>(fetchFn, `${api}/wishes/bought`, token),
  ]);
  if (!list.ok) return list;
  if (!bought.ok) return bought;
  return { ok: true, value: { list: list.value, bought: bought.value } };
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
