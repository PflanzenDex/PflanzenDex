import { motionReduced } from "./motion-setting";

/**
 * Scrolls `scroller` so that `target` stands at its top edge (a jump to a group or to a letter, SG-LIST-06). The movement is
 * smooth unless motion is reduced (US-QS-33, WCAG 2.3.3): then the list is there at once. `instant` is for a drag, which
 * follows the finger without a glide. A box without `scrollTo` (a test
 * without layout) gets its `scrollTop` set.
 */
export function scrollToTop(scroller: HTMLElement, target: HTMLElement, instant = false): void {
  const top =
    target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  if (typeof scroller.scrollTo === "function")
    scroller.scrollTo({ top, behavior: instant || motionReduced() ? "auto" : "smooth" });
  else scroller.scrollTop = top;
}
