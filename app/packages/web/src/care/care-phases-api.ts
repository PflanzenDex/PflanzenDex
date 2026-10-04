import type { PhasesRow, SwitchedSpecimen } from "@pflanzendex/core";
import { call, createWrite, currentTimeZone, type Response } from "../kernel";

type FetchFn = typeof fetch;

/**
 * Loads the care phases of the signed-in account (US-PHA-01). The profile's time zone (US-ACC-02; the device's as fallback) determines "today" (NFR-08).
 */
export async function loadCarePhases(
  api: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly PhasesRow[]>> {
  const timeZone = currentTimeZone();
  const r = await call<{ phases: PhasesRow[] }>(
    fetchFn,
    `${api}/care-phases?timeZone=${encodeURIComponent(timeZone)}`,
    token,
  );
  return r.ok ? { ok: true, value: r.value.phases } : r;
}

/**
 * "Jetzt umgestellt" (US-PHA-03): the specimens move to the target location of today's phase. The server decides the
 * target (selected, never typed, FR-PHA-03); the profile's time zone (US-ACC-02; the device's as fallback) determines "today" (NFR-08). The repeat-guard key
 * is created per call.
 */
export async function confirmPhaseSwitch(
  api: string,
  token: string,
  specimenIds: readonly string[],
  fetchFn: FetchFn = fetch,
): Promise<Response<readonly SwitchedSpecimen[]>> {
  const timeZone = currentTimeZone();
  const r = await createWrite(api, token, fetchFn)("POST", "/care-phases/confirm", {
    specimenIds,
    timeZone,
  });
  return r.ok ? { ok: true, value: (r.value as { specimens: SwitchedSpecimen[] }).specimens } : r;
}
