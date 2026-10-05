import type { CandidateList, WishRow } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../kernel";

/** Loads the open candidates sorted by space need (US-WUN-01); derived on every request, never stored. */
export function loadCandidates(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<CandidateList>> {
  return call<CandidateList>(fetchFn, `${api}/wishes/candidates`, token);
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
