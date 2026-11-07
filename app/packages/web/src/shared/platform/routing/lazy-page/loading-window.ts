import { useEffect, useState } from "react";
import type { AnyComponent, LazyPage } from "./lazy-page";

/**
 * How long a window's chunk may load before its loading status shows (US-QS-07, NFR-12). Starting value, assumption:
 * owner decision, issue 1575. A chunk that arrives within it shows no status at all, so a fast open does not flash.
 */
export const LOADING_STATUS_DELAY_MS = 300;

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
 * While the window is open and its chunk is still on its way, Escape calls `onOpenChange(false)` (US-QS-07, DS-40), from
 * the first moment of the wait, so also before the status shows. Once the component is there, Radix handles Escape
 * alone, so the window is closed once. Nothing else is stopped: the listener neither prevents nor stops the event.
 */
export function useLoadingWindow<C extends AnyComponent>(
  page: LazyPage<C>,
  open: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const [component, setComponent] = useState<C | null>(page.loaded);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!open || component) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, component, onOpenChange]);

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

  useEffect(() => {
    if (!open || component) return;
    const id = window.setTimeout(() => setDelayed(true), LOADING_STATUS_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setDelayed(false);
    };
  }, [open, component]);

  if (failure) throw failure.cause;
  return { Component: component, waiting: open && delayed && component === null };
}
