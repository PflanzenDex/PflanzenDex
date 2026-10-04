const DAY_MS = 86_400_000;
const two = (n: number): string => String(n).padStart(2, "0");

/**
 * The calendar date `days` after `date` (both `YYYY-MM-DD`). Pure calendar arithmetic on the date parts: no time of
 * day and no time zone is involved (NFR-08).
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) + days * DAY_MS);
  return `${moved.getUTCFullYear()}-${two(moved.getUTCMonth() + 1)}-${two(moved.getUTCDate())}`;
}
