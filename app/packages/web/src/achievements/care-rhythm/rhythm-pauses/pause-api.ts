import { type Response, type WriteOptions, writeFor } from "../../../shared/data";
import type { RhythmPauseItem } from "../../achievements-api";

/** Adds an explicit pause of the care rhythm (US-ACH-04): at most 4 weeks, local calendar dates. */
export async function addRhythmPause(
  api: string,
  token: string,
  pause: { from: string; until: string },
  options: WriteOptions = {},
): Promise<Response<RhythmPauseItem>> {
  const r = await writeFor(api, token, options)("POST", "/achievements/rhythm/pauses", pause);
  return r.ok ? { ok: true, value: r.value as RhythmPauseItem } : r;
}

/** Removes an explicit pause; its weeks count again (US-ACH-04). */
export async function removeRhythmPause(
  api: string,
  token: string,
  id: string,
  options: WriteOptions = {},
): Promise<Response<unknown>> {
  return writeFor(api, token, options)("DELETE", `/achievements/rhythm/pauses/${id}`);
}
