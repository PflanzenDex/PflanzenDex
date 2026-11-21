// The time zone every date of the app is computed in (NFR-08, US-ACC-02): the one chosen in the profile, until then the
// device's. Only `localToday`-style local dates come from it, never UTC.
let chosen: string | null = null;

/** The time zone of the device (what the browser reports). */
export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Called with the time zone of the profile after sign-in and after saving; `null` = none chosen, the device decides. */
export function setProfileTimeZone(timeZone: string | null): void {
  chosen = timeZone;
}

/** Phases, due dates and "today" use this one place, so a change in the profile reaches every request. */
export const currentTimeZone = (): string => chosen ?? deviceTimeZone();

/**
 * The local calendar date `YYYY-MM-DD` of `now` in the time zone of the profile (NFR-08), for a key that names the day of an
 * occasion (US-QS-03). A web-side helper: the shared write layer must not import the core package on the eager path.
 */
export const todayLocal = (now: Date = new Date(), timeZone: string = currentTimeZone()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
