// German texts of the onboarding errors (epic ONB) and of the account errors (US-ACC-01): the email confirmation for sharing and
// the sign out on all devices (issue 2065). They also carry the achievement texts, so `error.ts` stays under the file size limit.
import { ACHIEVEMENT_ERROR_TEXTS } from "./achievements";

export const ONBOARDING_ERROR_TEXTS = {
  ...ACHIEVEMENT_ERROR_TEXTS,
  "account.email_unconfirmed":
    "Bestätige zuerst deine E-Mail-Adresse. Erst dann kannst du Daten mit Freunden teilen; den Link dazu findest du in deinem Postfach.",
  "account.sign_out_everywhere_failed":
    "Abmelden auf allen Geräten hat nicht geklappt. Die anderen Geräte sind vielleicht noch angemeldet; versuche es gleich noch einmal.",
  "account.sign_out_everywhere_unavailable":
    "Abmelden auf allen Geräten ist auf diesem Server nicht eingerichtet. Melde dich hier ab; andere Geräte bleiben dann angemeldet.",
  "onboarding.unknown_function":
    "Diese Funktion kennt die App nicht. Öffne sie über die Navigation oder über „Was die App kann“; es wurde nichts geändert.",
  "onboarding.locked":
    "Diese Funktion ist noch gesperrt. Grund und Weg stehen dabei; du kannst sie jederzeit selbst freischalten.",
  "onboarding.unknown_occasion":
    "Diesen Hinweis kennt die App nicht. Es wurde nichts gespeichert; du kannst einfach weiterarbeiten.",
  "onboarding.keeper_off":
    "Diese Funktion ist ausgeschaltet. Schalte sie unter „Was die App kann“ wieder ein; freigeschaltet wurde nichts.",
  "onboarding.core_feature":
    "Diese Funktion gehört zum Kern der App und lässt sich nicht ausschalten. Es wurde nichts geändert.",
} as const;
