// German texts of the catalog correction errors (US-BES-16), kept apart so `error.ts` stays under the file size limit.
export const CORRECTION_ERROR_TEXTS = {
  "correction.not_found": "Diese Korrektur gibt es nicht. Lade die Prüfliste neu.",
  "correction.decided":
    "Diese Korrektur ist schon entschieden. Lade die Prüfliste neu; es wurde nichts geändert.",
  "correction.no_change":
    "Der Katalog hat diesen Wert schon. Schlage einen anderen Wert vor oder lass es, wie es ist.",
  "correction.duplicate_open":
    "Diesen Wert hat schon jemand vorgeschlagen und er ist noch in Prüfung. Es wurde nichts doppelt angelegt.",
  "correction.version_not_found":
    "Diese Version des Feldes gibt es nicht. Öffne den Verlauf und wähle eine vorhandene Version.",
  "correction.unchanged":
    "Das Feld hat diesen Wert schon. Wähle eine frühere Version mit einem anderen Wert; es wurde nichts geändert.",
  "correction.own_vote":
    "Das ist dein eigener Vorschlag. Darüber stimmen andere ab; es wurde nichts geändert.",
  "correction.vote_rate_limited":
    "Du hast in kurzer Zeit sehr viele Stimmen abgegeben. Versuche es in einer Stunde noch einmal.",
} as const;
