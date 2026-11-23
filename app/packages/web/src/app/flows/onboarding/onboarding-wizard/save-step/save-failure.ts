import { useCallback, useState } from "react";
import { errorText } from "@/shared/lib/error-text";
import { createKey, withConflictDismiss, type ApiError } from "@/shared/data";

/**
 * The create of the plant: the action names the operation only, the form is the body (US-QS-03). A key conflict keeps its
 * key; its error carries a `dismiss` that frees it and takes the note away (`withConflictDismiss`).
 */
export const FIRST_PLANT = createKey("specimen", "first-plant");

/**
 * The refusal of the save that is no marker problem, shown as text (P-10). `dismiss` is set for a key conflict of the
 * create only; `clear` removes the note when another species is chosen (US-QS-03).
 */
export function useSaveFailure() {
  const [failure, setFailure] = useState<ApiError | null>(null);
  const clear = useCallback(() => setFailure(null), []);
  const show = (error: ApiError) => setFailure(withConflictDismiss(error, FIRST_PLANT, clear));
  const text = failure ? errorText(failure.code) : null;
  return { text, dismiss: failure?.dismiss, show, clear };
}
