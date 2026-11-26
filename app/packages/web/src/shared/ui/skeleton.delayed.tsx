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

/** The acts that can end the app start: a press, a click (a screen reader's activation too) or a key on a control. */
const START_ACTS = ["pointerdown", "click", "keydown"] as const;

/** What a page change starts from: a link, a button or another control (a tap on the drawn start frame is none). */
const CONTROL =
  "a[href], button, input, select, textarea, summary, [role='button'], [role='link'], [tabindex]:not([tabindex='-1'])";

/** True during the app start (SG-STATE-02, owner answer Q-27): see `beginAppStart`. */
let starting = false;
/** True while the app puts its own address back (`runWithoutEndingStart`): the popstate of that is no act of the keeper. */
let puttingBack = false;

/**
 * Starts the app start (SG-STATE-02, owner answer Q-27, issue 1876): until the keeper first acts on a control (a press, a
 * click or a key on a link, a button, a field), goes back or forward, or leaves the page, every skeleton shows at once,
 * without the delay of DS-57, so the start is one loading picture from the first paint to the content. A tap or a scroll
 * on the drawn start frame acts on nothing, so it keeps the picture. A page change inside the app follows such an act, so
 * the delay applies to it again. The entry calls it once before the first render; it returns the end, which tests call.
 * Without it (tests, stories) every skeleton waits for the delay.
 */
export function beginAppStart(target: Window = window) {
  starting = true;
  const act = (event: Event) => {
    const on = event.target;
    if (on instanceof Element && on.closest(CONTROL)) end();
  };
  const hidden = () => {
    if (target.document.visibilityState === "hidden") end();
  };
  // Back or forward ends the start; a popstate the app puts back itself (`runWithoutEndingStart`) does not (issue 2244).
  const back = () => {
    if (!puttingBack) end();
  };
  function end() {
    starting = false;
    for (const type of START_ACTS) target.removeEventListener(type, act, true);
    target.removeEventListener("popstate", back, true);
    target.document.removeEventListener("visibilitychange", hidden);
  }
  for (const type of START_ACTS) target.addEventListener(type, act, true);
  target.addEventListener("popstate", back, true);
  target.document.addEventListener("visibilitychange", hidden);
  return end;
}

/**
 * Runs `put`, a change of the address that the app makes itself: the sign-in return puts the address of the person back
 * (US-BES-17, issue 1823). The popstate it dispatches, with which the router reads the address again, is no page change of
 * the keeper, so it does not end the app start: the skeletons that mount after it would wait for their delay and leave main
 * empty meanwhile (issue 2244). A back or forward of the keeper still ends the start.
 */
export function runWithoutEndingStart(put: () => void): void {
  puttingBack = true;
  try {
    put();
  } finally {
    puttingBack = false;
  }
}

/**
 * Renders its children, the skeleton of a part, only once the wait has lasted `delayMs` (US-QS-14, DS-57); during the app
 * start at once (`beginAppStart`, SG-STATE-02). Until then it renders `before`, nothing by default: a box that keeps the
 * part's place without drawing it (SG-STATE-02). Used as a Suspense fallback it mounts while the part waits and unmounts
 * with it, so the timer ends with the wait. It never holds the skeleton once shown: it goes as soon as the part arrives.
 */
export function DelayedSkeleton({
  delayMs = SKELETON_DELAY_MS,
  before = null,
  children,
}: {
  delayMs?: number;
  before?: ReactNode;
  children: ReactNode;
}) {
  const outerDue = useContext(DueContext);
  const [due, setDue] = useState(() => delayMs <= 0 || outerDue || starting);
  useEffect(() => {
    if (due) return;
    const id = window.setTimeout(() => setDue(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, due]);
  return due ? <DueContext.Provider value>{children}</DueContext.Provider> : before;
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
