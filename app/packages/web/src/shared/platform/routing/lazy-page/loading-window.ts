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
 * There is no Suspense fallback on purpose. React holds back the reveal of content for about 300 ms after any fallback
 * has been shown, so a fallback that shows the status would flash it on a fast open and race that hold (issue 1575).
 * A component that is already loaded renders at once.
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
