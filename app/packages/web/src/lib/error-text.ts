import { ERROR_TEXTS } from "@pflanzendex/core";

/** Shown for a code the web app does not know; raw server text is never displayed (P-10, FR-QG-11). */
export const GENERIC_ERROR_TEXT = "Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.";

/** German text for a stable error code `<domain>.<reason>`; unknown codes get the generic text (DS-49). */
export function errorText(code: string | undefined): string {
  if (code !== undefined && Object.hasOwn(ERROR_TEXTS, code))
    return ERROR_TEXTS[code as keyof typeof ERROR_TEXTS];
  return GENERIC_ERROR_TEXT;
}

/** Shape of the web `ApiError`; its raw `text` is deliberately ignored (P-10). */
type ServerError = {
  text?: string;
  code: string;
  details?: readonly { field: string; code: string }[];
};
type SetError = (name: string, error: { type: string; message: string }) => void;

/**
 * Hands a server error to a form (DS-49): every `details` entry lands on its field, the main code on
 * `root.server` (shown by a form-level `FormMessage`). Pass react-hook-form's `setError`.
 */
export function applyServerError(error: ServerError, setError: SetError): void {
  for (const d of error.details ?? [])
    setError(d.field, { type: "server", message: errorText(d.code) });
  setError("root.server", { type: "server", message: errorText(error.code) });
}
