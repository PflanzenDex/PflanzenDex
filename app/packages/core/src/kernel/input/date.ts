// Calendar dates are local dates of the user (NFR-08, QG-D4): the date follows the user's time zone, never the
// UTC date (prototype bug B-01). The clock comes from outside (parameter), never from the domain code.

const FORMAT = { year: "numeric", month: "2-digit", day: "2-digit" } as const;

function formatter(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-CA", { ...FORMAT, timeZone: timeZone });
  } catch {
    return null;
  }
}

/** An IANA time zone name like `Europe/Berlin` or `UTC`; offsets like `+02:00` do not count. */
export function isTimeZone(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 64 && /^[A-Za-z]/.test(value) && !!formatter(value)
  );
}

/** Today's calendar date `YYYY-MM-DD` in the user's time zone at the moment `now`. */
export function localToday(now: Date, timeZone: string): string {
  const format = formatter(timeZone);
  if (!format) throw new Error(`Unknown time zone: ${timeZone}`);
  const share = Object.fromEntries(format.formatToParts(now).map((t) => [t.type, t.value]));
  return `${share["year"]}-${share["month"]}-${share["day"]}`;
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date `YYYY-MM-DD` that exists in the calendar (no 31st of February, leap years respected). */
export function isCalendarDate(value: unknown): value is string {
  const match = typeof value === "string" ? CALENDAR_DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const OFFSET = {
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
} as const;

/** Milliseconds the wall clock of `timeZone` is ahead of UTC at the instant `at` (DST respected). */
function offsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", { ...OFFSET, timeZone }).formatToParts(
    new Date(at),
  );
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - at;
}

/**
 * The instant at which the wall clock of `timeZone` shows `date` (`YYYY-MM-DD`) at `time` (`HH:MM`): "08:00 local" as a
 * point in time (NFR-08). A time that does not exist (spring forward) lands just after the gap.
 */
export function localInstant(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetMs(wall, timeZone);
  return new Date(wall - offsetMs(first, timeZone));
}

/** Whole days from calendar date `from` to calendar date `to` (negative when `to` is earlier); no clock, no zone. */
export function daysBetween(from: string, to: string): number {
  const ms = (v: string) => Date.parse(`${v}T00:00:00Z`);
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}
