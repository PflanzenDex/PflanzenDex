// Anniversaries with the plant (US-ACH-06): derived from the catch date, never stored (FR-ACH-02). An anniversary is
// every half year after the catch date; it stays visible until the end of that week (Sunday, assumption), then it is
// gone, while the specimen's history still shows its age (P-10). Pure; dates are local calendar dates (NFR-08).

/** Starting values (assumptions): half-yearly anniversaries; the entry stays until Sunday of the anniversary week. */
export const ANNIVERSARY_LIMITS = { halfYearMonths: 6 } as const;

export interface AnniversarySpecimen {
  readonly id: string;
  readonly name: string;
  /** Local calendar date `YYYY-MM-DD`, `null` when unknown (US-POK-07). */
  readonly caughtOn: string | null;
  readonly archivedOn: string | null;
}

export interface Anniversary {
  readonly specimenId: string;
  readonly name: string;
  /** Months since the catch date: 6, 12, 18, … */
  readonly months: number;
  /** The anniversary day, local calendar date. */
  readonly date: string;
  readonly caughtOn: string;
}

const MS_PER_DAY = 86_400_000;
const parts = (d: string): [number, number, number] =>
  d.split("-").map(Number) as [number, number, number];

const two = (n: number): string => String(n).padStart(2, "0");
const format = (y: number, m: number, d: number): string => `${y}-${two(m)}-${two(d)}`;

/** The date `months` after `from`; a day that does not exist in the target month falls on its last day. */
function addMonths(from: string, months: number): string {
  const [y, m, d] = parts(from);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return format(year, month + 1, Math.min(d, last));
}

/** The Sunday of the week (Monday to Sunday) that contains `date`. */
function endOfWeek(date: string): string {
  const [y, m, d] = parts(date);
  const t = Date.UTC(y, m - 1, d);
  const weekday = new Date(t).getUTCDay(); // 0 = Sunday
  const end = new Date(t + ((7 - weekday) % 7) * MS_PER_DAY);
  return format(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate());
}

/**
 * The anniversaries that are due on `today`: of every active specimen with a known catch date, the latest half-year
 * anniversary whose day lies on or before `today` and whose week has not ended. Archived specimens and unknown catch
 * dates show nothing (P-08). Ordered by date, then name.
 */
export function anniversaries(
  specimens: readonly AnniversarySpecimen[],
  today: string,
): Anniversary[] {
  const found: Anniversary[] = [];
  for (const s of specimens) {
    if (s.caughtOn === null || s.archivedOn !== null) continue;
    for (let k = 1; ; k++) {
      const months = k * ANNIVERSARY_LIMITS.halfYearMonths;
      const date = addMonths(s.caughtOn, months);
      if (date > today) break;
      if (today <= endOfWeek(date)) {
        found.push({ specimenId: s.id, name: s.name, months, date, caughtOn: s.caughtOn });
      }
    }
  }
  return found.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "de"));
}
