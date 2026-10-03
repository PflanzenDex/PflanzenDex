// Kalenderdaten sind lokale Daten des Nutzers (NFR-08, QG-D4): das Datum folgt der Zeitzone des Nutzers, nie dem
// UTC-Datum (Prototyp-Fehler B-01). Die Uhr kommt von außen (Parameter), nie aus dem Fachcode.

const FORMAT = { year: "numeric", month: "2-digit", day: "2-digit" } as const;

function formatierer(zeitzone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-CA", { ...FORMAT, timeZone: zeitzone });
  } catch {
    return null;
  }
}

/** Ein IANA-Zeitzonenname wie `Europe/Berlin` oder `UTC`; Versätze wie `+02:00` zählen nicht. */
export function istZeitzone(wert: unknown): wert is string {
  return (
    typeof wert === "string" && wert.length <= 64 && /^[A-Za-z]/.test(wert) && !!formatierer(wert)
  );
}

/** Das heutige Kalenderdatum `JJJJ-MM-TT` in der Zeitzone des Nutzers zum Zeitpunkt `jetzt`. */
export function heuteLokal(jetzt: Date, zeitzone: string): string {
  const format = formatierer(zeitzone);
  if (!format) throw new Error(`Unbekannte Zeitzone: ${zeitzone}`);
  const teile = Object.fromEntries(format.formatToParts(jetzt).map((t) => [t.type, t.value]));
  return `${teile["year"]}-${teile["month"]}-${teile["day"]}`;
}
