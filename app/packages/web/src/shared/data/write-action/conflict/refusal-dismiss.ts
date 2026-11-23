import { useCallback, useRef } from "react";
import { isKeyConflict, type ApiError } from "../../api";
import { releaseRepeatKey, type KeyScope } from "../repeat-key";

/** The answer of a write that was a key conflict: the action whose key it holds (none for a background write). */
type Conflict = { readonly scope: KeyScope | null };

const idOf = (scope: KeyScope) => `${scope.target}\u0000${scope.action}`;

/**
 * The dismiss of a key conflict, for `useWriteAction` (US-QS-03, P-10). A key conflict of a create or an append holds the
 * key of its action, so the keeper could not go on with another entry; the error that is handed out carries `dismiss`,
 * which frees that key, clears the refusal (`record(null)`) and returns the focus to the control that started the write.
 * The notice that shows the refusal offers it as "Hinweis schließen" (`RefusalClose`, `RefusalAlert`, `ErrorNotice`).
 *
 * `start` notes the control that starts a write. `answered` records the answer's error (a key conflict carries `dismiss`)
 * and returns `onClose` for a toast that says it, which frees the key when the toast is gone. Both free the key only
 * while their conflict is still the last answer of its action: a lost answer that came later keeps its key, so the retap
 * repeats it and no second record is written. `dismissRefusal` clears the refusal on show and frees the key of the
 * conflict that stands.
 */
export function useRefusalDismiss(record: (error: ApiError | null) => void) {
  const last = useRef(new Map<string, Conflict>());
  const shown = useRef<Conflict | null>(null);
  const starter = useRef<Element | null>(null);
  const release = useCallback((mine: Conflict) => {
    const { scope } = mine;
    if (!scope) return true;
    if (last.current.get(idOf(scope)) !== mine) return false;
    last.current.delete(idOf(scope));
    releaseRepeatKey(scope);
    return true;
  }, []);
  const dismiss = useCallback(
    (mine: Conflict | null) => {
      if (mine && !release(mine)) return;
      record(null);
      if (starter.current instanceof HTMLElement && starter.current.isConnected)
        starter.current.focus();
    },
    [release, record],
  );
  const start = useCallback(() => {
    starter.current = document.activeElement;
  }, []);
  const answered = useCallback(
    (error: ApiError | null, scope: KeyScope | null) => {
      const mine = error && isKeyConflict(error) ? { scope } : null;
      shown.current = mine;
      if (scope) {
        if (mine) last.current.set(idOf(scope), mine);
        else last.current.delete(idOf(scope));
      }
      record(error && mine ? { ...error, dismiss: () => dismiss(mine) } : error);
      return { onClose: mine ? () => void release(mine) : undefined };
    },
    [dismiss, release, record],
  );
  const dismissRefusal = useCallback(() => dismiss(shown.current), [dismiss]);
  return { start, answered, dismissRefusal };
}
