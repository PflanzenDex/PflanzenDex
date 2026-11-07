import { useEffect, useRef } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { refusalText } from "@/shared/lib/error-text";

/** What a refusal of the server carries: its code and its own text (`ApiError` of `shared/data`). */
type Refusal = { code: string; text: string };

/** The red alert box of a refusal that names no field; takes the focus (see `useServerRefusal`). */
export const ALERT_CLASSES =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Hands a server refusal to a form: the fields it names get the German text of the refusal (`refusalText`, DS-49,
 * P-10, and the app's own network text when the server does not answer, FR-QG-11) and the first of them takes the
 * focus. Returns the alert text when the refusal names no field, and the ref of its alert, which takes the focus
 * instead. A refusal of a field goes away as soon as that field is edited (react-hook-form revalidates it), without
 * moving the focus. `fieldsOf` must be stable (module level), otherwise the refusal is handed over again on every render.
 */
export function useServerRefusal<T extends FieldValues, E extends Refusal>(
  error: E | null,
  setError: UseFormSetError<T>,
  fieldsOf: (error: E) => Path<T>[],
) {
  const alertRef = useRef<HTMLDivElement>(null);
  const alertText = error && fieldsOf(error).length === 0 ? refusalText(error) : null;
  useEffect(() => {
    if (!error) return;
    const fields = fieldsOf(error);
    fields.forEach((field, i) =>
      setError(field, { type: "server", message: refusalText(error) }, { shouldFocus: i === 0 }),
    );
    if (fields.length === 0) alertRef.current?.focus();
  }, [error, setError, fieldsOf]);
  return { alertText, alertRef };
}
