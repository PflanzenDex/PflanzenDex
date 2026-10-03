import type { PhasesRow } from "@pflanzendex/core";
import { call, type Response } from "../kernel";

type FetchFn = typeof fetch;

/**
 * Loads the care phases of the signed-in account (US-PHA-01). The device's time zone determines "today" (NFR-08); the
 * profile does not know one yet (US-ACC-02).
 */
export async function loadCarePhases(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly PhasesRow[]>> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await call<{ phases: PhasesRow[] }>(
    fetchFn,
    `${api}/care-phases?timeZone=${encodeURIComponent(timeZone)}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.phases } : r;
}
