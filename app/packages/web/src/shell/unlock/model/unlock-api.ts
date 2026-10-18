import type { UnlockStatus } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../../kernel";

/** One function as the API sends it: registry data plus the derived state, reason and way as data (US-ONB-05). */
export type UnlockEntry = UnlockStatus & { epic?: string; destination?: string };

/** Every function that may be announced; a function the operator switched off is not in the list (FR-ONB-03). */
export async function loadUnlocks(
  api: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<readonly UnlockEntry[]>> {
  const zone = encodeURIComponent(currentTimeZone());
  const r = await call<{ functions: UnlockEntry[] }>(
    fetchFn,
    `${api}/onboarding/unlocks?timeZone=${zone}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.functions } : r;
}

/** "Jetzt freischalten": stores the keeper's decision once; it is never revoked (DM-ONB-02). */
export function unlockFunction(
  api: string,
  token: string,
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<unknown>> {
  return createWrite(api, token, fetchFn)("POST", `/onboarding/unlocks/${encodeURIComponent(id)}`, {
    timeZone: currentTimeZone(),
  });
}
