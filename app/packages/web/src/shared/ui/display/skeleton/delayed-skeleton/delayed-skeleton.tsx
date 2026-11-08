import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** True inside a skeleton that is already due: a skeleton nested in it shows at once, so a composed one waits one delay only (issue 1697). */
const DueContext = createContext(false);

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
  const outerDue = useContext(DueContext);
  const [due, setDue] = useState(delayMs <= 0 || outerDue);
  useEffect(() => {
    if (due) return;
    const id = window.setTimeout(() => setDue(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, due]);
  return due ? <DueContext.Provider value>{children}</DueContext.Provider> : null;
}
