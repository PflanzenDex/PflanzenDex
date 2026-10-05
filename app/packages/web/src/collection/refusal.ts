import { useEffect } from "react";
import type { FieldValues, Path, UseFormReturn, UseFormSetError } from "react-hook-form";
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
 * Hands a server refusal to a form (DS-49, P-10): the fields it names get the German text of its error code and the
 * first of them takes the focus. Returns the text for a form-level alert when the refusal names no field. A refusal
 * of a field goes away as soon as that field is edited (react-hook-form revalidates it).
 */
export function useRefusal<T extends FieldValues>(
  error: ApiError | null,
  setError: UseFormSetError<T>,
  fieldsOf: (error: ApiError) => Path<T>[],
): string | null {
  useEffect(() => {
    if (!error) return;
    fieldsOf(error).forEach((field, i) =>
      setError(field, { type: "server", message: refusalText(error) }, { shouldFocus: i === 0 }),
    );
  }, [error, setError, fieldsOf]);
  return error && fieldsOf(error).length === 0 ? refusalText(error) : null;
}

/** Editing any field takes the form-level refusal away, so an outdated message does not stay next to new input. */
export function useEdited<T extends FieldValues>(form: UseFormReturn<T>, onEdit: () => void) {
  const { watch } = form;
  useEffect(() => {
    const subscription = watch(onEdit);
    return () => subscription.unsubscribe();
  }, [watch, onEdit]);
}
