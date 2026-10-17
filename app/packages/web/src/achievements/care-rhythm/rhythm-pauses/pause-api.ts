import { createWrite, type Response } from "../../../kernel";
import type { RhythmPauseItem } from "../../achievements-api";

/** Adds an explicit pause of the care rhythm (US-ACH-04): at most 4 weeks, local calendar dates. */
export async function addRhythmPause(
  api: string,
  token: string,
  pause: { from: string; until: string },
  fetchFn: typeof fetch = fetch,
): Promise<Response<RhythmPauseItem>> {
  const r = await createWrite(api, token, fetchFn)("POST", "/achievements/rhythm/pauses", pause);
  return r.ok ? { ok: true, value: r.value as RhythmPauseItem } : r;
}

/** Removes an explicit pause; its weeks count again (US-ACH-04). */
export async function removeRhythmPause(
  api: string,
  token: string,
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response<unknown>> {
  return createWrite(api, token, fetchFn)("DELETE", `/achievements/rhythm/pauses/${id}`);
}
