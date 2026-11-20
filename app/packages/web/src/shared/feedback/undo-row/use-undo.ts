import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useAnnounce } from "@/shared/platform/announcer/context";

/** How long a change stays in its place with its undo (SG-FEED-03; starting value and assumption of US-QS-32). */
export const UNDO_MS = 8000;

/** One changed item that stays in its place until the undo window ends. */
export interface Held<T> {
  /** Unique per item (a row, a plant); a new hold of the same key replaces the old one. */
  readonly key: string;
  /** The items of one write: one undo takes back the whole group (a bulk write). */
  readonly group: string;
  /** The item as it stood before the write; shown in place of the server state until the window ends. */
  readonly item: T;
  /** Where the item stood in its list before the write; it is placed there again. */
  readonly index: number;
  /** The text the row shows and the live region says, for example "Erledigt". */
  readonly result: string;
  /** Whether this item's row shows the undo button (a bulk write shows it on one row only). */
  readonly undoable: boolean;
}

export interface HoldEntry<T> {
  readonly key: string;
  readonly group: string;
  readonly item: T;
  readonly index: number;
  readonly undoable: boolean;
}

export interface Undo<T> {
  readonly held: readonly Held<T>[];
  /** Holds the entries in their places for `UNDO_MS` and says `said` (default: `result`) once to screen readers. */
  hold(entries: readonly HoldEntry<T>[], result: string, said?: string): void;
  /** Ends the hold of a group now: after its undo, or when the write is taken back. */
  release(group: string): void;
}

/**
 * The changes of a write that stay in place with their undo (SG-FEED-01, SG-FEED-03, US-QS-32): the item keeps its
 * place for `UNDO_MS`, its result is announced through the shared live region, then the hold ends by itself. Writes
 * stay with the caller (`useWriteAction`); this hook only keeps the state of the window.
 */
export function useUndo<T>(): Undo<T> {
  const [held, setHeld] = useState<readonly Held<T>[]>([]);
  const timers = useRef(new Map<string, { group: string; id: ReturnType<typeof setTimeout> }>());
  const announce = useAnnounce();

  const expire = useCallback((key: string) => {
    timers.current.delete(key);
    setHeld((list) => list.filter((h) => h.key !== key));
  }, []);

  const hold = useCallback(
    (entries: readonly HoldEntry<T>[], result: string, said: string = result) => {
      for (const e of entries) {
        const previous = timers.current.get(e.key);
        if (previous) clearTimeout(previous.id);
        const id = setTimeout(() => expire(e.key), UNDO_MS);
        timers.current.set(e.key, { group: e.group, id });
      }
      setHeld((list) => [
        ...list.filter((h) => !entries.some((e) => e.key === h.key)),
        ...entries.map((e) => ({ ...e, result })),
      ]);
      announce?.announce(said);
    },
    [announce, expire],
  );

  const release = useCallback((group: string) => {
    for (const [key, t] of timers.current) {
      if (t.group !== group) continue;
      clearTimeout(t.id);
      timers.current.delete(key);
    }
    setHeld((list) => list.filter((h) => h.group !== group));
  }, []);

  useEffect(() => {
    const open = timers.current;
    return () => {
      for (const t of open.values()) clearTimeout(t.id);
      open.clear();
    };
  }, []);

  return { held, hold, release };
}

/**
 * The server's rows with the held items put back at their places, so the list keeps its shape until the window ends.
 * A held item replaces the server row with the same key (the server already has it done or moved).
 */
export function placeHeld<T>(
  rows: readonly T[],
  held: readonly Held<T>[],
  keyOf: (row: T) => string,
): T[] {
  const keys = new Set(held.map((h) => h.key));
  const shown = rows.filter((r) => !keys.has(keyOf(r)));
  for (const h of [...held].sort((a, b) => a.index - b.index)) {
    shown.splice(Math.min(h.index, shown.length), 0, h.item);
  }
  return shown;
}

/**
 * When the undo row of a control goes away, the focus that sat on it goes back to the control (US-QS-32): it is not lost
 * to the body. A focus another element holds stays where it is.
 */
export function useReturnFocus(shown: boolean, control: RefObject<HTMLElement | null>): void {
  const wasShown = useRef(false);
  // A layout effect: the control gets the focus in the commit that removes the undo row, not a frame later.
  useLayoutEffect(() => {
    if (shown) {
      wasShown.current = true;
      return;
    }
    if (
      wasShown.current &&
      (document.activeElement === null || document.activeElement === document.body)
    )
      control.current?.focus();
    wasShown.current = false;
  }, [shown, control]);
}
