// Dates for "pause for a week" (US-MON-08): the local calendar date in the zone of the profile, never from UTC (NFR-08).

/** Today's date `YYYY-MM-DD` in `timeZone`. */
export const localToday = (timeZone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** `date` plus `days` calendar days, as `YYYY-MM-DD` (pure calendar arithmetic, no zone involved). */
export function addDays(date: string, days: number): string {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${two(next.getUTCMonth() + 1)}-${two(next.getUTCDate())}`;
}
