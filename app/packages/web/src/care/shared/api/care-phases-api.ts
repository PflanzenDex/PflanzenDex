import type { PhasesRow, SwitchedSpecimen } from "@pflanzendex/core";
import {
  call,
  createWrite,
  currentTimeZone,
  type Response,
  type WriteOptions,
} from "../../../shared/data";

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
 * "Umstellen" (US-PHA-03): the specimens move to the target location of today's phase. The server decides the
 * target (selected, never typed, FR-PHA-03); the profile's time zone (US-ACC-02; the device's as fallback) determines "today" (NFR-08). The repeat-guard key
 * is created per call.
 */
export async function confirmPhaseSwitch(
  api: string,
  token: string,
  specimenIds: readonly string[],
  options: WriteOptions,
): Promise<Response<readonly SwitchedSpecimen[]>> {
  const timeZone = currentTimeZone();
  const r = await createWrite(api, token, options)("POST", "/care-phases/confirm", {
    specimenIds,
    timeZone,
  });
  return r.ok ? { ok: true, value: (r.value as { specimens: SwitchedSpecimen[] }).specimens } : r;
}

/**
 * The undo of a bulk move (US-QS-32): each plant gets its earlier location back through the location write of
 * `specimen.set_location` (P-03), one after the other. The first refusal stops the undo and is returned.
 */
export async function restorePhaseLocations(
  api: string,
  token: string,
  moves: readonly { specimenId: string; locationId: string }[],
  options: WriteOptions,
): Promise<Response<unknown>> {
  for (const move of moves) {
    const r = await createWrite(api, token, options)(
      "POST",
      `/specimens/${encodeURIComponent(move.specimenId)}/location`,
      { locationId: move.locationId },
    );
    if (!r.ok) return r;
  }
  return { ok: true, value: null };
}
