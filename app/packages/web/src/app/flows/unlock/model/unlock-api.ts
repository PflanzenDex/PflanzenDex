import type { UnlockStatus } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../../../../shared/data";

/**
 * One function as the API sends it: registry data plus the derived state, reason and way as data (US-ONB-05). `keeperSwitch`
 * names the keeper switch of the function (US-ONB-09); a function without one is core.
 */
export type UnlockEntry = UnlockStatus & {
  epic?: string;
  destination?: string;
  keeperSwitch?: string;
};

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

/**
 * The keeper's switch of a feature outside the core purpose (US-ONB-09): on or off, the data stays. The answer is the stored
 * row; the lock states are refreshed by the write (P-03).
 */
export function setKeeperSwitch(
  api: string,
  token: string,
  feature: string,
  enabled: boolean,
): Promise<Response<unknown>> {
  return createWrite(api, token)("PUT", `/onboarding/switches/${encodeURIComponent(feature)}`, {
    enabled,
    timeZone: currentTimeZone(),
  });
}
