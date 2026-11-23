import { isKeyConflict, type ApiError } from "../../api";
import { releaseRepeatKey, type KeyScope } from "../repeat-key";

/**
 * The dismiss of a key conflict for a write that uses the repeat guard directly (`useRepeatKey().run`, `runRepeat`), as
 * `useRefusalDismiss` gives it to `useWriteAction` (US-QS-03, P-10). Such a write keeps its own refusal state, so the caller
 * hands over `clear`, the function that removes its notice. Call it where the refusal is stored:
 * `setError(withConflictDismiss(r.error, scope, () => setError(null)))`.
 *
 * Only a key conflict of a create or an append (`scope.adds`) gets `dismiss`: the repeat guard keeps its key (an earlier
 * write under it has landed or still runs), so without a way to free it the keeper could not enter anything else until a
 * reload. A conflict of a set-state frees its key at once (`settle`), and every other refusal leaves the error as it is.
 *
 * `dismiss` frees the key, clears the refusal and returns the focus to the control that was focused when the refusal came
 * (the one that started the write), as the notice that showed it takes the focus away. The notice that shows the refusal
 * offers it as "Hinweis schließen" (`RefusalClose`, `RefusalAlert`, `ErrorNotice`, `FormNotices`).
 */
export function withConflictDismiss(error: ApiError, scope: KeyScope, clear: () => void): ApiError {
  if (scope.adds !== true || !isKeyConflict(error)) return error;
  const starter = document.activeElement;
  return {
    ...error,
    dismiss: () => {
      releaseRepeatKey(scope);
      clear();
      if (starter instanceof HTMLElement && starter.isConnected) starter.focus();
    },
  };
}
