// German texts of the onboarding errors (epic ONB) and of the account error for sharing (US-ACC-01). They also carry the
// achievement texts, so `error.ts` stays under the file size limit with one spread.
import { ACHIEVEMENT_ERROR_TEXTS } from "./achievements";

export const ONBOARDING_ERROR_TEXTS = {
  ...ACHIEVEMENT_ERROR_TEXTS,
  "account.email_unconfirmed":
    "Bestätige zuerst deine E-Mail-Adresse. Erst dann kannst du Daten mit Freunden teilen; den Link dazu findest du in deinem Postfach.",
  "onboarding.unknown_function":
    "Diese Funktion kennt die App nicht. Öffne sie über die Navigation oder über „Was die App kann“; es wurde nichts geändert.",
  "onboarding.locked":
    "Diese Funktion ist noch gesperrt. Grund und Weg stehen dabei; du kannst sie jederzeit selbst freischalten.",
  "onboarding.unknown_occasion":
    "Diesen Hinweis kennt die App nicht. Es wurde nichts gespeichert; du kannst einfach weiterarbeiten.",
} as const;
