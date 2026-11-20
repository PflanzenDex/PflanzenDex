import { useEffect, useSyncExternalStore } from "react";

/** One key of a view: the keys as shown and the German name of the action, from the view's message table. */
export type ViewKeyRow = { readonly id: string; readonly keys: string; readonly label: string };

/**
 * The local keys of the view on screen (US-QS-11: the overview lists every shortcut available in this view and
 * globally). They act only where the view has the focus, so they never enter the global register, which refuses the
 * arrow keys and Backspace (US-ENT-10). The view registers them while it is mounted; the overview reads them.
 */
const NONE: readonly ViewKeyRow[] = [];
let current: readonly ViewKeyRow[] = NONE;
const listeners = new Set<() => void>();

function set(rows: readonly ViewKeyRow[]): void {
  current = rows;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Lists `rows` in the shortcut overview while the calling view is mounted. Pass a stable array. */
export function useViewKeys(rows: readonly ViewKeyRow[]): void {
  useEffect(() => {
    set(rows);
    return () => {
      if (current === rows) set(NONE);
    };
  }, [rows]);
}

/** The local keys of the view on screen, empty when it has none. */
export function useViewKeyRows(): readonly ViewKeyRow[] {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => NONE,
  );
}
