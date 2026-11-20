import { useLayoutEffect, useRef } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { refusalText } from "@/shared/lib/error-text";

/** What a refusal of the server carries: its code and its own text (`ApiError` of `shared/data`). */
type Refusal = { code: string; text: string };

/** The default text of a field a refusal names: the German text of its code (DS-49). Module level: a stable default. */
const byCode = <E extends Refusal>(_field: unknown, error: E) => refusalText(error);

/**
 * Hands a server refusal to a form: the fields it names get the text `textOf` gives them (by default the German text
 * of the refusal, `refusalText`, DS-49, P-10; the app's own network text when the server does not answer, FR-QG-11)
 * and the first of them takes the focus. Returns the alert text when the refusal names no field, and the ref of its
 * alert, which takes the focus instead. A refusal of a field goes away as soon as that field is edited (react-hook-form
 * revalidates it), without moving the focus. `fieldsOf` and `textOf` must be stable (module level), otherwise the
 * refusal is handed over again on every render.
 */
export function useServerRefusal<T extends FieldValues, E extends Refusal>(
  error: E | null,
  setError: UseFormSetError<T>,
  fieldsOf: (error: E) => Path<T>[],
  textOf: (field: Path<T>, error: E) => string = byCode,
) {
  const alertRef = useRef<HTMLDivElement>(null);
  const alertText = error && fieldsOf(error).length === 0 ? refusalText(error) : null;
  // A layout effect: the field or the alert that takes the focus is in the commit of the refusal, so the focus is on it
  // before anything reads the page (SC 2.4.3); a passive effect leaves it on the body until React flushes it.
  useLayoutEffect(() => {
    if (!error) return;
    const fields = fieldsOf(error);
    fields.forEach((field, i) =>
      setError(field, { type: "server", message: textOf(field, error) }, { shouldFocus: i === 0 }),
    );
    if (fields.length === 0) alertRef.current?.focus();
  }, [error, setError, fieldsOf, textOf]);
  return { alertText, alertRef };
}
