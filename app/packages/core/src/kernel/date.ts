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
