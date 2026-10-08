import type { CareProfile, CareProfileChanges, CareProfileEntry } from "@pflanzendex/core";
import { call, createWrite, type Response } from "../../kernel";

type FetchFn = typeof fetch;

/** Loads the care profile view of the account (US-BES-09): catalog value and my deviation per species. */
export async function loadCareProfiles(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly CareProfileEntry[]>> {
  const r = await call<{ entries: CareProfileEntry[] }>(fetchFn, `${api}/care-profiles`, token);
  return r.ok ? { ok: true, value: r.value.entries } : r;
}

/**
 * Changes fields of my care profile of one species (US-BES-09): a value sets, `null` resets to the catalog, a field
 * that is not named stays. The repeat-guard key is created per call.
 */
export async function saveCareProfile(
  api: string,
  token: string,
  input: { speciesId: string; changes: CareProfileChanges },
  fetchFn: FetchFn = fetch,
): Promise<Response<CareProfile>> {
  const r = await createWrite(api, token, fetchFn)(
    "PUT",
    `/care-profiles/${encodeURIComponent(input.speciesId)}`,
    input.changes,
  );
  return r.ok ? { ok: true, value: r.value as CareProfile } : r;
}
