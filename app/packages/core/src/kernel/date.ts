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
