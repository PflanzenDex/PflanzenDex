import { useEffect } from "react";

/** A page whose chunk can be requested ahead of its first render (`lazyPage`, US-QS-07). */
export type Preloadable = { load: () => Promise<unknown> };

/** Longest wait for an idle moment before a batch runs anyway (starting value, assumption, issue 1645). */
const IDLE_TIMEOUT_MS = 1500;

/**
 * Runs `run` when the browser is idle, or after a short timer where it has no idle callbacks (Safari). Returns the cancel.
 */
function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, IDLE_TIMEOUT_MS / 5);
  return () => window.clearTimeout(id);
}

/**
 * Requests the chunks of `pages` now. A page shares its request, so a page is requested once however often this runs. A
 * failed request is not lost: the page requests its chunk again when it opens and then shows the error with retry (P-10),
 * so the failure is not swallowed here, only shown later at its own place.
 */
export function preloadPages(pages: readonly Preloadable[]): void {
  for (const page of pages) void page.load().catch(() => undefined);
}

/**
 * Requests the batches one after the other, each when the browser is idle, so the start of the app keeps its time
 * (US-QS-07, issue 1645). Returns the cancel of the batches still waiting.
 */
export function preloadWhenIdle(batches: readonly (readonly Preloadable[])[]): () => void {
  let cancel = () => {};
  const next = (index: number) => {
    const batch = batches[index];
    if (batch === undefined) return;
    cancel = whenIdle(() => {
      preloadPages(batch);
      next(index + 1);
    });
  };
  next(0);
  return () => cancel();
}

/**
 * Requests the pages behind a link as soon as the link is pressed or focused, so a tap that comes first does not wait for
 * its chunk (US-QS-07, issue 1645). `pagesOf` gives the pages of a link's address, or nothing for other links; it must be
 * the same function on every render. It renders nothing.
 */
export function usePreloadOnIntent(
  pagesOf: (href: string) => readonly Preloadable[] | undefined,
): void {
  useEffect(() => {
    const onIntent = (event: Event) => {
      const href = (event.target as Element | null)?.closest?.("a[href]")?.getAttribute("href");
      const pages = href === null || href === undefined ? undefined : pagesOf(href);
      if (pages) preloadPages(pages);
    };
    document.addEventListener("pointerdown", onIntent, { capture: true, passive: true });
    document.addEventListener("focusin", onIntent, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onIntent, { capture: true });
      document.removeEventListener("focusin", onIntent, { capture: true });
    };
  }, [pagesOf]);
}
