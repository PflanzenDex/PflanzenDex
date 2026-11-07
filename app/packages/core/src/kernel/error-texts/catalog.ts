// German texts of the catalog errors: review (US-BES-10) and corrections (US-BES-16), and the CSV import of plants
// (US-BES-18, same epic), kept apart so `error.ts` stays under the file size limit.
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

// The CSV import (US-BES-18, FR-BES-26): whole-file refusals (nothing is written) and the reasons a row is flagged.
export const IMPORT_ERROR_TEXTS = {
  "import.file_unreadable":
    "Die Datei lässt sich nicht als Tabelle lesen. Speichere sie als CSV in UTF-8 mit Komma oder Semikolon als Trennzeichen; jede Zeile darf nicht mehr Felder haben als die Kopfzeile. Es wurde nichts gespeichert.",
  "import.no_species_column":
    "In der Kopfzeile fehlt die Spalte „Art“ (oder „species name“). Ergänze sie und lade die Datei erneut. Es wurde nichts gespeichert.",
  "import.too_large":
    "Die Datei ist zu groß. Ein Import umfasst höchstens 500 Pflanzen und 1 MB; teile die Datei auf und versuche es erneut. Es wurde nichts gespeichert.",
  "import.column_repeated":
    "Eine Spalte steht zweimal in der Kopfzeile. Lass nur eine stehen und lade die Datei erneut. Es wurde nichts gespeichert.",
  "import.species_missing":
    "Diese Zeile hat keinen Artnamen. Trage ihn ein oder überspringe die Zeile.",
  "import.species_not_found":
    "Diese Art steht nicht im Katalog. Wähle eine Art aus dem Katalog oder überspringe die Zeile; eine neue Art legst du zuerst im Katalog an.",
  "import.species_candidates":
    "Der Name passt nicht genau auf eine Art. Wähle eine der genannten Arten oder überspringe die Zeile.",
  "import.duplicate_row":
    "Diese Pflanze steht schon weiter oben in der Datei, mit derselben Art und demselben Kennzeichen. Sie wird nur einmal angelegt.",
} as const;
