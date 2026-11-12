import { useSyncExternalStore } from "react";
import { motionReduced, subscribeMotion } from "./motion-setting";

/**
 * True while motion is reduced (WCAG 2.3.3, US-QS-14, US-QS-33): the device asks for it or the keeper chose "Bewegung
 * aus". CSS covers the transitions, the card logic reads this; a change applies at once. Without `matchMedia` (old
 * browsers, jsdom) only the choice counts.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionReduced, () => false);
}
