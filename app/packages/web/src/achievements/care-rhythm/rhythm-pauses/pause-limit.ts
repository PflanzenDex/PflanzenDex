// The longest explicit pause of the care rhythm (US-ACH-04, F-0371): the limit of the core, both ends included.
import { daysBetween, MAX_PAUSE_DAYS } from "@pflanzendex/core";

/** Whether a pause from `from` to `until` (both days in) is longer than the core allows; no clock, no zone. */
export function isPauseTooLong(from: string, until: string): boolean {
  return (
    from !== "" && until !== "" && until >= from && daysBetween(from, until) + 1 > MAX_PAUSE_DAYS
  );
}

/** The last day a pause that starts on `from` may name: `from` plus the limit minus one (Von 24.11. → Bis 21.12.). */
export function lastPauseDay(from: string): string {
  const [y = 1970, m = 1, d = 1] = from.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, d + MAX_PAUSE_DAYS - 1));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${last.getUTCFullYear()}-${two(last.getUTCMonth() + 1)}-${two(last.getUTCDate())}`;
}
