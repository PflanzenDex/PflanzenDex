import { useEffect, useRef } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { errorText } from "@/lib/error-text";
import type { ApiError } from "../kernel";

/**
 * The German text of a refusal (DS-49, P-10): by its error code, never the raw server text. The one code the web
 * app makes up itself (the server did not answer) carries its own German text.
 */
export function refusalText(error: ApiError): string {
  return error.code === "network.not_reachable" ? error.text : errorText(error.code);
}

/**
 * Hands a server refusal to a form: the fields it names get the German text of its error code and the first of them
 * takes the focus (P-10). Returns the alert text when the refusal names no field, and the ref of its alert, which
 * takes the focus instead. A refusal of a field goes away as soon as that field is edited (react-hook-form
 * revalidates it), without moving the focus.
 */
export function useServerRefusal<T extends FieldValues>(
  error: ApiError | null,
  setError: UseFormSetError<T>,
  fieldsOf: (error: ApiError) => Path<T>[],
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

/** The red alert box of a refusal that names no field; takes the focus (see `useServerRefusal`). */
export const ALERT_CLASSES =
  "rounded-lg border border-destructive p-3 text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
