import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** True inside a skeleton that is already due: a skeleton nested in it shows at once, so a composed one waits one delay only (issue 1697). */
const DueContext = createContext(false);

/**
 * How long a loading part may wait before its skeleton shows (US-QS-14, DS-57). Starting value, assumption (issue 1697):
 * a part that arrives sooner shows no skeleton and no status at all, so a fast load does not flash.
 */
export const SKELETON_DELAY_MS = 200;

/**
 * How long a shown shapeless loader stays at least (US-QS-14, D5, issue 1772): a centred spinner or status text without a
 * shape is replaced only this long after it has shown, so it never flashes. Starting value, assumption (owner decision D5,
 * 2026-11-09). A shaped skeleton is never held (DS-57).
 */
export const STATUS_HOLD_MS = 300;

/**
 * Renders its children, the skeleton of a part, only once the wait has lasted `delayMs` (US-QS-14, DS-57). Used as a
 * Suspense fallback it mounts while the part waits and unmounts with it, so the timer ends with the wait. It never holds
 * the skeleton once shown: the skeleton goes as soon as the part arrives.
 */
export function DelayedSkeleton({
  delayMs = SKELETON_DELAY_MS,
  children,
}: {
  delayMs?: number;
  children: ReactNode;
}) {
  const outerDue = useContext(DueContext);
  const [due, setDue] = useState(delayMs <= 0 || outerDue);
  useEffect(() => {
    if (due) return;
    const id = window.setTimeout(() => setDue(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, due]);
  return due ? <DueContext.Provider value>{children}</DueContext.Provider> : null;
}

type LoaderPhase = "idle" | "waiting" | "shown" | "over";

/**
 * Whether a shapeless loader (a `PlantLoader` or a centred status text) is on screen (US-QS-14, D5, issue 1772): true while
 * `pending`, and for `STATUS_HOLD_MS` after the loader has shown although the load has ended. The wait before it shows is
 * the delay of DS-57, so a load that ends before the loader showed gives false at once: nothing shows and nothing is held.
 * A new load starts a new wait. Call it before any early return. While it is true, render the loader in a `DelayedSkeleton`
 * at the same place, so the loader stays mounted and shown through the hold; render the loaded content only while it is
 * false. A shaped skeleton does not use it: it goes as soon as the content is there (DS-57).
 */
export function useHeldLoader(pending: boolean): boolean {
  const [phase, setPhase] = useState<LoaderPhase>("idle");
  useEffect(() => {
    // A load starts a wait, from idle or after a hold; a load that ends while still waiting cancels the wait (nothing shows).
    setPhase((current) => {
      if (pending) return current === "idle" || current === "over" ? "waiting" : current;
      return current === "waiting" ? "idle" : current;
    });
  }, [pending]);
  // Both timers start with the wait, so the hold ends STATUS_HOLD_MS after the loader showed, whatever the render takes.
  const timed = phase === "waiting" || phase === "shown";
  useEffect(() => {
    if (!timed) return;
    const shows = window.setTimeout(() => setPhase("shown"), SKELETON_DELAY_MS);
    const ends = window.setTimeout(() => setPhase("over"), SKELETON_DELAY_MS + STATUS_HOLD_MS);
    return () => {
      window.clearTimeout(shows);
      window.clearTimeout(ends);
    };
  }, [timed]);
  return pending || phase === "shown";
}
