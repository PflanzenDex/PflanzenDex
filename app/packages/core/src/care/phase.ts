// Care phase of a specimen (US-PHA-01, FR-PHA-01) and its next change (US-PHA-04). Pure functions: the phase and the
// next change are derived from the calendar on every request and never stored (P-01).
import { addDays } from "./treatment-dates";

export const CARE_PHASES = ["growth", "dormancy"] as const;
export type CarePhase = (typeof CARE_PHASES)[number];

/** Month-day `MM-DD` of a local calendar date `YYYY-MM-DD` (NFR-08). */
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

/** The next phase change (US-PHA-04): the first day of the new phase. */
export interface NextPhaseChange {
  /** Local calendar date `YYYY-MM-DD` on which `phase` begins (NFR-08). */
  readonly date: string;
  /** The phase that begins on `date`. */
  readonly phase: CarePhase;
  /** Calendar days from today; 0 = the change is today. */
  readonly days: number;
}

/**
 * The earliest phase change on or after `today` within this and the next calendar year (US-PHA-04). A change is the
 * first day of a phase: `from` for the dormancy and the day after `until` for the growth phase, because both bounds
 * belong to the dormancy (`carePhase`). Derived day by day with `carePhase`, so the list and the forecast cannot
 * disagree, also around the 29th of February. `null` if the phase never changes in that window (e.g. 01-01 to 12-31).
 */
export function nextPhaseChange(
  from: string,
  until: string,
  today: string,
): NextPhaseChange | null {
  const last = `${Number(today.slice(0, 4)) + 1}-12-31`;
  let before = carePhase(from, until, addDays(today, -1));
  for (let days = 0, date = today; date <= last; days++, date = addDays(today, days)) {
    const phase = carePhase(from, until, date);
    if (phase !== before) return { date, phase, days };
    before = phase;
  }
  return null;
}
