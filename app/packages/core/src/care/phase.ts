// Care phase of a specimen (US-PHA-01, FR-PHA-01). Pure functions: the phase is derived from the
// calendar on every request and never stored (P-01).

export const CARE_PHASES = ["growth", "dormancy"] as const;
export type CarePhase = (typeof CARE_PHASES)[number];

/** Monat-Tag `MM-TT` eines lokalen Kalenderdatums `JJJJ-MM-TT` (NFR-08). */
export const monthTag = (date: string): string => date.slice(5, 10);

/**
 * Dormancy if `today` lies in the period `from` to `until` (both days included), otherwise growth phase. The period may
 * span the turn of the year (e.g. 11-01 to 03-15). `today` is the user's local date (`localToday`), never the UTC date.
 * Comparing the month-day texts `MM-DD` is chronological.
 */
export function carePhase(source: string, until: string, today: string): CarePhase {
  const tag = monthTag(today);
  const inDormancy =
    source <= until ? tag >= source && tag <= until : tag >= source || tag <= until;
  return inDormancy ? "dormancy" : "growth";
}
