import type { AccountProfile } from "../../api/account-api";

/** What a row shows when a value cannot be read (P-08). */
export const UNKNOWN = "unbekannt";

const known = (text: string | null | undefined) => (text ? text : UNKNOWN);

/** Row "Profil": display name and time zone, which may break after its slash at 200 % text (issue 1315). */
export const profileValue = (p: AccountProfile) =>
  `${known(p.displayName)} · ${known(p.timeZone).replaceAll("/", "/\u200b")}`;

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

/** Row "Wie nutzt du die App?": the chosen style and, while it is on, calm mode. */
export function styleValue(style: "few" | "many", calm: boolean | undefined): string {
  const text = style === "many" ? "viel, alles offen" : "ein paar Pflanzen";
  return calm === true ? `${text} · Ruhemodus an` : text;
}
