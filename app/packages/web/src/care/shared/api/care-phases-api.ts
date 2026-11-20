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
 * target (selected, never typed, FR-PHA-03); the profile's time zone (US-ACC-02; the device's as fallback) determines "today" (NFR-08). The repeat-guard key is the
 * caller's (`options.key`, US-QS-03).
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
 * Each plant is a write of its own, so it carries a key of its own: the key of the undo and the plant's id (US-QS-03).
 * The server refuses a key that comes back with another body, so one shared key would fail at the second plant. A repeat
 * of the undo has the same keys, so a lost answer on one plant is repeated under its own key.
 */
export async function restorePhaseLocations(
  api: string,
  token: string,
  moves: readonly { specimenId: string; locationId: string }[],
  options: WriteOptions,
): Promise<Response<unknown>> {
  for (const move of moves) {
    const perPlant = { ...options, key: `${options.key}:${move.specimenId}` };
    const r = await createWrite(api, token, perPlant)(
      "POST",
      `/specimens/${encodeURIComponent(move.specimenId)}/location`,
      { locationId: move.locationId },
    );
    if (!r.ok) return r;
  }
  return { ok: true, value: null };
}
