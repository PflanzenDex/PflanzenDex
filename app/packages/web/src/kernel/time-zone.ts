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
