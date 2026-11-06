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
 */
export function useLoadingWindow<C extends AnyComponent>(page: LazyPage<C>, open: boolean) {
  const [component, setComponent] = useState<C | null>(page.loaded);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const [delayed, setDelayed] = useState(false);

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
