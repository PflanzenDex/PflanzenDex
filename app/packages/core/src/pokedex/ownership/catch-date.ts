// Catch date of a species (US-POK-07, P-01: derived, never stored): the earliest date across all specimens of the
// keeper, active and archived. Per specimen: `caught_at` (exact), else the local creation date (approximate), else
// unknown. A date is never guessed (P-08).
import { localToday } from "../../kernel";
import type { SpecimenRow } from "../../collection";
import type { CatchDate } from "../types";

const UNKNOWN: CatchDate = { date: null, source: "unknown" };

/** Local calendar date of an instant, or `null` if the text is not a readable moment (NFR-08). */
function localDate(instant: string | null, timeZone: string): string | null {
  if (instant === null) return null;
  const moment = new Date(instant);
  return Number.isNaN(moment.getTime()) ? null : localToday(moment, timeZone);
}

/** The date of one specimen in the order `caught_at` → creation date → unknown. */
export function specimenCatchDate(
  z: Pick<SpecimenRow, "caughtAt" | "createdAt">,
  timeZone: string,
): CatchDate {
  if (z.caughtAt !== null) return { date: z.caughtAt, source: "caught_at" };
  const created = localDate(z.createdAt, timeZone);
  return created === null ? UNKNOWN : { date: created, source: "created_at" };
}

/** The earliest known date of several; unknown ones never hide a known one. On a tie the exact date wins. */
export function earliest(dates: readonly CatchDate[]): CatchDate {
  let best = UNKNOWN;
  for (const d of dates) {
    if (d.date === null) continue;
    const earlier = best.date === null || d.date < best.date;
    const exactTie = d.date === best.date && d.source === "caught_at";
    if (earlier || exactTie) best = d;
  }
  return best;
}
