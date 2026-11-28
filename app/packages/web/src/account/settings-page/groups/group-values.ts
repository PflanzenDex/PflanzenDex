import { deviceTimeZone } from "../../../shared/data";
import { texts } from "../../../shared/lib/text-rules/texts";
import type { AccountProfile } from "../../api/account-api";
import table from "../../views/views.de.json";

const ui = texts(table);

/** What a row shows when a value cannot be read (P-08). */
export const UNKNOWN = "unbekannt";

/** The display name of a row: "Name unbekannt" while none is saved, so the label says what is unknown (SG-STATE-06, F-0315). */
export const nameValue = (name: string | null | undefined): string =>
  name ? name : ui("row.nameUnknown");

/**
 * The time zone of a row (F-0315, SG-STATE-06, owner answers Q08 and Q23): the saved zone; while none is saved the device's
 * zone, named as the device's ("Zeitzone vom Gerät", the profile form prefills it); "Zeitzone unbekannt" only when the device
 * gives none. Never a bare "unbekannt".
 */
export function timeZoneValue(saved: string | null | undefined): string {
  if (saved) return saved;
  const device: string | undefined = deviceTimeZone();
  return device ? ui("row.zoneFromDevice") : ui("row.zoneUnknown");
}

/** Row "Profil": display name and time zone, which may break after its slash at 200 % text (issue 1315). */
export const profileValue = (p: AccountProfile) =>
  `${nameValue(p.displayName)} · ${timeZoneValue(p.timeZone).replaceAll("/", "/\u200b")}`;

/**
 * Row "Benachrichtigungen": reminders are not sent yet, push is not set up (issue 2028, US-QS-32), so the row says so
 * instead of counting the switches that are on. It counts again once push exists.
 */
export const notificationsValue = "noch nicht eingerichtet";

/** Row "Datenschutz und Empfehlungen": "Standard" while nothing deviates, otherwise what is on. */
export function privacyValue(p: AccountProfile): string {
  const on = [
    p.everythingPrivate ? "alles privat" : null,
    p.noRecommendations ? "keine Empfehlungen" : null,
    p.rarityConsent ? "Seltenheit zählt mit" : null,
  ].filter((x) => x !== null);
  return on.length === 0 ? "Standard" : on.join(" · ");
}

/** Row "Wunschliste". */
export const wishlistValue = (p: AccountProfile) => `mind. ${p.replenishBuffer} je Zone`;

/** Row "Licht": the thresholds are the standard ones while none are stored (P-08). */
export const lightValue = (p: AccountProfile) =>
  p.positionThresholds === null ? "Standard-Schwellen" : "eigene Schwellen";

/** Row "Wie nutzt du die App?": the chosen style only; the calm mode has its own switch row on the settings list (US-QS-32). */
export function styleValue(style: "few" | "many"): string {
  return style === "many" ? "viel, alles offen" : "ein paar Pflanzen";
}
