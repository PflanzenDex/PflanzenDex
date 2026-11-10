import { useEffect, useRef, useState } from "react";
import type { AnyComponent, LazyPage } from "./lazy-page";

/**
 * How long a window's chunk may load before its loading status shows (US-QS-07, NFR-12). Starting value, assumption:
 * owner decision, issue 1575. A chunk that arrives within it shows no status at all, so a fast open does not flash.
 */
export const LOADING_STATUS_DELAY_MS = 300;

/**
 * How long a shown loading status stays at least (US-QS-14, D5, issue 1784): once it has shown, the content waits this long
 * even when the chunk arrives sooner. Starting value, assumption (owner decision D5, 2026-11-09). A shaped skeleton is never
 * held (DS-57); the window status is a shapeless centred status, so it is.
 */
export const LOADING_STATUS_HOLD_MS = 300;

/**
 * The component of a window's chunk once it has loaded (`null` before), and whether the loading status may show: the
 * window is open and the wait is longer than `LOADING_STATUS_DELAY_MS` (US-QS-07). A failed load throws into the nearest
 * `ChunkErrorBoundary`, which shows the error with retry (P-10).
 *
 * Only the chunk wait is outside a Suspense boundary. The window keeps a Suspense around the loaded component for what its
 * body loads (a lazy part inside the window waits under the window's fallback and does not reach the route's boundary).
 * A fallback around the chunk wait would start React's hold of about 300 ms on the reveal of content and flash the
 * status on a fast open (issue 1575), so the chunk is waited for here instead, and a loaded component renders at once.
 *
 * Once the status has shown, it stays `LOADING_STATUS_HOLD_MS` at least (US-QS-14, D5, issue 1784), also when the chunk
 * arrives sooner: `Component` waits for the end of that hold, so the status is never replaced by a flash of content. A
 * window that closes ends the status and the hold; the next open waits its own delay.
 *
 * While the window is open and its content is not there yet, Escape calls `onOpenChange(false)` (US-QS-07, DS-40), from
 * the first moment of the wait, so also before the status shows. Once the content renders, Radix handles Escape alone, so
 * the window is closed once. Nothing else is stopped: the listener neither prevents nor stops the event.
 */
export function useLoadingWindow<C extends AnyComponent>(
  page: LazyPage<C>,
  open: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const [component, setComponent] = useState<C | null>(page.loaded);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  // `shown`: the wait has lasted the delay, so the status is due; `held`: the status has shown and stays for the hold.
  const [shown, setShown] = useState(false);
  const [held, setHeld] = useState(false);
  // The hold's timer: started with the delay's timer (not in an effect), so both end on the same clock; it outlives the
  // wait, because the chunk's arrival must not cut the hold short.
  const holdTimer = useRef<number | undefined>(undefined);
  // The content renders once the chunk is in and no hold of a shown status is left.
  const ready = component !== null && !held;

  useEffect(() => {
    if (!open || ready) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, ready, onOpenChange]);

  useEffect(() => {
    if (component) return;
    let current = true;
    page.load().then(
      (loaded) => {
        if (current) setComponent(() => loaded);
      },
      (cause: unknown) => {
        if (current) setFailure({ cause });
      },
    );
    return () => {
      current = false;
    };
  }, [page, component]);

  // The wait: a chunk that arrives within the delay leaves it unshown. When the delay has passed, the status shows and its
  // hold starts (D5, issue 1784); the chunk's arrival ends the wait but not the hold.
  useEffect(() => {
    if (!open || component) return;
    const id = window.setTimeout(() => {
      setShown(true);
      setHeld(true);
      holdTimer.current = window.setTimeout(() => setHeld(false), LOADING_STATUS_HOLD_MS);
    }, LOADING_STATUS_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [open, component]);

  // A window that closes starts over: no status and no hold (the next open waits its own delay).
  useEffect(() => {
    if (open) return;
    window.clearTimeout(holdTimer.current);
    setShown(false);
    setHeld(false);
  }, [open]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  if (failure) throw failure.cause;
  return {
    Component: ready ? component : null,
    waiting: open && (held || (shown && component === null)),
  };
}
