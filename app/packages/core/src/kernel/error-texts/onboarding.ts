// German texts of the onboarding errors (epic ONB). They also carry the achievement texts, so `error.ts` stays under
// the file size limit with one spread.
import { ACHIEVEMENT_ERROR_TEXTS } from "./achievements";

export const ONBOARDING_ERROR_TEXTS = {
  ...ACHIEVEMENT_ERROR_TEXTS,
  "onboarding.unknown_function":
    "Diese Funktion kennt die App nicht. Öffne sie über die Navigation oder über „Was die App kann“; es wurde nichts geändert.",
  "onboarding.locked":
    "Diese Funktion ist noch gesperrt. Grund und Weg stehen dabei; du kannst sie jederzeit selbst freischalten.",
  "onboarding.unknown_occasion":
    "Diesen Hinweis kennt die App nicht. Es wurde nichts gespeichert; du kannst einfach weiterarbeiten.",
} as const;
