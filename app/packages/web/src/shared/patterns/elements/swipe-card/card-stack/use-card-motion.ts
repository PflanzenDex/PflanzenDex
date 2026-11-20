import { useEffect, useRef, useState } from "react";
import { vibrateOnDecision } from "@/shared/platform/device/haptics";
import {
  EXIT_MS,
  REDUCED_STAMP_MS,
  flightMs,
  throwDirection,
  type SwipeDirection,
  type Throw,
} from "../swipe-gesture";

/** The size of the screen in px, which a flight must leave. */
export const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/**
 * Reports the end of a flight once: after the flight time, or under reduced motion after the stamp was shown for a short
 * moment without any motion (US-ENT-10); a decision vibrates once.
 */
export function useFlightEnd(
  exit: SwipeDirection | null,
  onExited: (d: SwipeDirection) => void,
  reduced: boolean,
  ms: number,
) {
  const latest = useRef({ onExited, reduced, ms });
  useEffect(() => {
    latest.current = { onExited, reduced, ms };
  });
  useEffect(() => {
    if (exit === null) return;
    vibrateOnDecision();
    const { reduced: still, ms: flight } = latest.current;
    const timer = setTimeout(
      () => latest.current.onExited(exit),
      still ? REDUCED_STAMP_MS : flight,
    );
    return () => clearTimeout(timer);
  }, [exit]);
}

/** True for the first frames of a card that comes back (US-ENT-10): it starts off the screen, then moves into place. */
export function useEntering(enterFrom: SwipeDirection | null, reduced: boolean): boolean {
  const [entering, setEntering] = useState(() => enterFrom !== null && !reduced);
  useEffect(() => {
    if (!entering) return;
    // Two frames, so the start pose is painted before the move begins.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntering(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [entering]);
  return entering;
}

/** The throw of the release when the card leaves the way it was thrown; a button or a key has none. */
export function thrownAlong(thrown: Throw | null, exit: SwipeDirection | null): Throw | null {
  return thrown !== null && exit !== null && throwDirection(thrown) === exit ? thrown : null;
}

/**
 * The throw of the last release (US-ENT-10) and how long the flight takes: along the throw when the card leaves the way
 * it was thrown, else the usual `EXIT_MS`. A refused write brings the card back, so its throw is spent.
 */
export function useThrow(exit: SwipeDirection | null) {
  const [thrown, setThrown] = useState<Throw | null>(null);
  const [seenExit, setSeenExit] = useState(exit);
  if (exit !== seenExit) {
    setSeenExit(exit);
    if (exit === null) setThrown(null);
  }
  const along = thrownAlong(thrown, exit);
  return { thrown, setThrown, ms: along ? flightMs(along, viewport()) : EXIT_MS };
}
