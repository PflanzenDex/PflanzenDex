import { call, createWrite, currentTimeZone, type Response } from "../../../../../shared/data";

/** The one hint that may show now (or none) and the stored end of the first-plant guide (US-ONB-07, DM-ONB-03). */
export type HintState = { hint: string | null; guideEnded: boolean };

/**
 * The occasions that have a note in the web (US-ONB-07): the plant occasions at the plant layer ("Messen", the tab "Verlauf")
 * and the function occasion on "Heute". Core keeps `plant_without_place` in its list for stored rows; the web shows no note for it.
 */
const NOTE_OCCASIONS = ["first_plant_saved", "first_measurement", "function_unlocked"] as const;
export type NoteOccasion = (typeof NOTE_OCCASIONS)[number];
export const isNoteOccasion = (value: unknown): value is NoteOccasion =>
  (NOTE_OCCASIONS as readonly unknown[]).includes(value);
/** The function occasion of "Heute" (US-ONB-07): the note that a rule's unlock names; compared by this constant (FR-QG-12). */
export const FUNCTION_UNLOCKED = "function_unlocked" as const;

/**
 * The key of the answer for a list of occasions in the data layer (DS-09): read by `ContextHint`, filled early by
 * `prefetchHints`, so both mean the same copy. The occasions are part of the key, as they are of the request.
 */
export const hintsKey = (applicable: readonly string[]) =>
  ["onboarding", "hints", applicable.join(",")] as const;

export function loadHints(
  api: string,
  token: string,
  applicable: readonly string[],
  fetchFn: typeof fetch = fetch,
): Promise<Response<HintState>> {
  const zone = encodeURIComponent(currentTimeZone());
  const list = encodeURIComponent(applicable.join(","));
  return call<HintState>(
    fetchFn,
    `${api}/onboarding/hints?timeZone=${zone}&applicable=${list}`,
    token,
  );
}

/** Stores that a hint was shown or dismissed, or that the guide ended; per account, not per device (DM-ONB-03). */
export function saveHint(
  api: string,
  token: string,
  occasion: string,
  state: "shown" | "dismissed",
): Promise<Response<unknown>> {
  return createWrite(api, token)("PUT", `/onboarding/hints/${encodeURIComponent(occasion)}`, {
    state,
    timeZone: currentTimeZone(),
  });
}
