// Stable, machine-readable error codes `<domain>.<reason>` (FR-QG-11). Codes are never renamed.
export const ERROR_TEXTS = {
  "input.invalid": "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
  "access.not_signed_in": "Du bist nicht angemeldet. Bitte melde dich an.",
  "access.denied": "Darauf hast du keinen Zugriff.",
  "idempotency.key_missing": "Der Wiederholungsschutz-Schlüssel fehlt.",
  "idempotency.key_conflict":
    "Dieser Schlüssel wurde bereits mit anderen Angaben verwendet. Bitte versuche es neu.",
  "idempotency.in_progress": "Dieselbe Aktion läuft noch. Bitte warte einen Moment.",
  "system.unexpected":
    "Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es später erneut.",
  "invitation.invalid":
    "Dieser Einladungscode ist ungültig, abgelaufen oder schon benutzt. Prüfe die Eingabe oder bitte um einen neuen Code.",
  "invitation.required":
    "Die Registrierung ist im Moment nur mit Einladungscode möglich. Gib den Code ein, den du bekommen hast.",
  "review.already_exists": "Für dieses Objekt läuft schon eine Prüfung.",
  "review.not_found": "Diesen Prüfvorgang gibt es nicht.",
  "review.status_invalid": "Dieser Vorgang ist schon entschieden.",
  "review.reason_missing": "Zum Zurückweisen gehört ein Grund, den der Ersteller sehen kann.",
  "review.approval_incomplete":
    "Die Art ist nicht vollständig genug zur Freigabe. Prüfe die fehlenden Angaben und Quellen.",
  "review.merge_target_invalid":
    "Mit dieser Art lässt sich der Vorschlag nicht zusammenführen. Wähle eine bereits freigegebene Art, die nicht der Vorschlag selbst ist.",
  "review.merge_conflict":
    "Das Zusammenführen ist nicht möglich, weil der Ersteller bei der Zielart schon ein Exemplar mit demselben Kennzeichen hat. Es wurde nichts geändert; lass ihn das Kennzeichen ändern oder gib den Vorschlag frei.",
  "review.merge_lock_failed":
    "Der Vorschlag konnte für das Zusammenführen gerade nicht gesperrt werden. Es wurde nichts geändert; versuche es gleich noch einmal.",
  "species.duplicate":
    "Diese Art gibt es schon (gleicher Name oder Synonym). Wähle die vorhandene Art, statt eine zweite anzulegen.",
  "species.not_found": "Diese Art gibt es nicht.",
  "specimen.name_taken":
    "Ein Exemplar mit diesem Namen gibt es schon. Gib ein Kennzeichen an (zum Beispiel eine Farbe), damit du die Töpfe unterscheiden kannst.",
  "specimen.marker_taken":
    "Dieses Kennzeichen gibt es bei dieser Art schon. Wähle ein anderes, damit du die Töpfe unterscheiden kannst.",
  "specimen.marker_required":
    "Du hast schon ein Exemplar dieser Art. Gib dem neuen ein Kennzeichen, damit du die Töpfe unterscheiden kannst.",
  "specimen.markers_missing":
    "Ab dem dritten Exemplar braucht jedes Exemplar der Art ein Kennzeichen. Vergib die fehlenden Kennzeichen, dann wird gespeichert.",
  "specimen.caught_in_future":
    "Das Fangdatum liegt in der Zukunft. Wähle heute oder ein früheres Datum.",
  "specimen.not_found": "Dieses Exemplar gibt es nicht.",
  "specimen.not_a_cutting": "Dieses Exemplar ist kein Steckling und muss nicht eingetopft werden.",
  "specimen.already_archived": "Dieses Exemplar ist schon archiviert.",
  "specimen.not_archived": "Dieses Exemplar ist nicht archiviert.",
  "specimen.archived":
    "Dieses Exemplar ist archiviert. Stelle es zuerst wieder her, dann kannst du damit arbeiten.",
  "treatment.not_found": "Diese Behandlung gibt es nicht.",
  "wish.name_taken":
    "Einen Wunsch mit diesem Namen gibt es schon. Prüfe die Wunschliste, statt ihn doppelt anzulegen.",
  "care.no_phase":
    "Dieses Exemplar hat keine Pflegephase (Steckling oder Art ohne Ruhephasen-Zeitraum) und wird nicht umgestellt.",
  "care.target_unknown":
    "Für dieses Exemplar ist noch kein Soll-Standort bekannt. Weise den Standort stattdessen selbst zu.",
  "location.name_taken": "Einen Standort mit diesem Namen gibt es schon.",
  "location.not_found": "Diesen Standort gibt es nicht.",
  "light_zone.name_taken": "Eine Lichtzone mit diesem Namen gibt es schon.",
  "light_zone.not_found": "Diese Lichtzone gibt es nicht.",
  "light_zone.in_use":
    "Diese Lichtzone wird noch genutzt und kann nicht gelöscht werden. Ordne die genannten Einträge zuerst einer anderen Zone zu.",
  "light_zone.not_empty":
    "Du hast schon Lichtzonen. Die Voreinstellung ist nur für ein Konto ohne Zonen.",
} as const;

export type ErrorCode = keyof typeof ERROR_TEXTS;

export const ERROR_CODE_FORMAT = /^[a-z_]+\.[a-z_]+$/;

export interface ErrorDetail {
  readonly field: string;
  readonly code: ErrorCode;
}

export interface AppError {
  readonly code: ErrorCode;
  /** German text from ERROR_TEXTS; UI and AI translate by `code`, never by the text. */
  readonly text: string;
  readonly details?: readonly ErrorDetail[];
  /** Domain details for display, e.g. which entries use a zone (P-10: nothing disappears silently). */
  readonly data?: unknown;
  /** For logs only, never for display (FR-QG-11). */
  readonly cause?: unknown;
}

export function appError(
  code: ErrorCode,
  extra: { details?: readonly ErrorDetail[]; data?: unknown; cause?: unknown } = {},
): AppError {
  return { code, text: ERROR_TEXTS[code], ...extra };
}
