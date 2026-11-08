import { useEffect, useState, type ReactNode } from "react";

/**
 * How long a loading part may wait before its skeleton shows (US-QS-14, DS-57). Starting value, assumption (issue 1697):
 * a part that arrives sooner shows no skeleton and no status at all, so a fast load does not flash.
 */
export const SKELETON_DELAY_MS = 200;

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
  const [due, setDue] = useState(delayMs <= 0);
  useEffect(() => {
    if (due) return;
    const id = window.setTimeout(() => setDue(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, due]);
  return due ? <>{children}</> : null;
}
