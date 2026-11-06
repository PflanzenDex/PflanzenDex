// German texts of the catalog errors: review (US-BES-10) and corrections (US-BES-16), kept apart so `error.ts` stays under
// the file size limit.
export const REVIEW_ERROR_TEXTS = {
  "review.already_exists": "Für dieses Objekt läuft schon eine Prüfung.",
  "review.not_found": "Diesen Prüfvorgang gibt es nicht.",
  "review.status_invalid": "Dieser Vorgang ist schon entschieden.",
  "review.reason_missing": "Zum Zurückweisen gehört ein Grund, den der Ersteller sehen kann.",
  "review.approval_incomplete":
    "Die Art ist nicht vollständig genug zur Freigabe. Prüfe die fehlenden Angaben und Quellen.",
  "review.merge_target_invalid":
    "Mit dieser Art lässt sich der Vorschlag nicht zusammenführen. Wähle eine bereits freigegebene Art, die nicht der Vorschlag selbst ist.",
  "review.merge_conflict":
    "Das Zusammenführen ist nicht möglich, weil der Ersteller bei der Zielart schon eine Pflanze mit demselben Kennzeichen hat. Es wurde nichts geändert; lass ihn das Kennzeichen ändern oder gib den Vorschlag frei.",
  "review.merge_lock_failed":
    "Der Vorschlag konnte für das Zusammenführen gerade nicht gesperrt werden. Es wurde nichts geändert; versuche es gleich noch einmal.",
  "review.name_approved":
    "Diesen lateinischen Namen gibt es schon freigegeben. Führe den Vorschlag mit der vorhandenen Art zusammen.",
} as const;

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
  "correction.no_value":
    "Diese Meldung enthält keinen Vorschlag und kann nicht übernommen werden. Lehne sie mit einer Begründung ab oder lass sie offen.",
} as const;
