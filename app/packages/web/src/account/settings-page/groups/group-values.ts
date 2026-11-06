import type { AccountProfile } from "../../api/account-api";
import { visibleOccasions } from "../../settings-fields/settings-fields";

/** What a row shows when a value cannot be read (P-08). */
export const UNKNOWN = "unbekannt";

const known = (text: string | null | undefined) => (text ? text : UNKNOWN);

/** Row "Profil": display name and time zone, which may break after its slash at 200 % text (issue 1315). */
export const profileValue = (p: AccountProfile) =>
  `${known(p.displayName)} · ${known(p.timeZone).replaceAll("/", "/\u200b")}`;

/** Row "Benachrichtigungen": how many of the occasions that have a switch are on. */
export function notificationsValue(p: AccountProfile, social: boolean): string {
  const occasions = visibleOccasions(social);
  const on = occasions.filter((o) => p.notifications[o]).length;
  return `${on} von ${occasions.length} an`;
}

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

/** Row "Tastenkürzel": the mode of the keyboard shortcuts (US-QS-11); "Einzeltasten an" is the starting value. */
const SHORTCUT_VALUE: Record<AccountProfile["keyboardShortcuts"], string> = {
  plain: "Einzeltasten an",
  modifier: "mit Alt und Umschalt",
  disabled: "aus",
};
export const shortcutsValue = (p: AccountProfile) => SHORTCUT_VALUE[p.keyboardShortcuts];
