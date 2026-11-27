import * as React from "react";
import { startDrag, type Drag, type Session } from "./sheet.handle-drag";

/** How far a finger goes before the gesture is a drag of the sheet or a scroll of the content (starting value, assumption). */
const SLOP_PX = 8;

/** A gesture of one finger on the content: where it began, and what it turned out to be. */
type Gesture = { x: number; y: number; atTop: boolean; session: Session | null; scroll: boolean };

/** Whether the content under the finger is scrolled to its top: every scroll region around the target, up to the sheet. */
function scrolledToTop(target: Element, sheet: HTMLElement | null): boolean {
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement)
    if (el.hasAttribute("data-scroll-region") && el.scrollTop > 0) return false;
  return true;
}

/**
 * A downward swipe on the content of a sheet (US-QS-15, owner decision 2026-11-23, issue 2418; as iOS and Maps do it): when the
 * content is scrolled to its top, the swipe drags the sheet by the same rules as the handle (it snaps to half or full height,
 * a long drag down past half closes it); in any other case, and for an upward or sideways swipe, the content scrolls as it
 * always did and the sheet does not move. The height changes only through a swipe that starts at the top of the content.
 * The drag claims the touch (`touchmove` is not passive), so the browser does not scroll under it. The code is in the lazy
 * chunk of the sheet.
 */
export function useContentSwipe(drag: Drag, body: HTMLElement | null): void {
  const latest = React.useRef(drag);
  React.useEffect(() => {
    latest.current = drag;
  });
  React.useEffect(() => {
    if (!body) return;
    let gesture: Gesture | null = null;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      const alone = event.touches.length === 1 && touch !== undefined;
      gesture = alone
        ? {
            x: touch.clientX,
            y: touch.clientY,
            atTop: scrolledToTop(event.target as Element, body.parentElement),
            session: null,
            scroll: false,
          }
        : null;
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!gesture || gesture.scroll || !touch) return;
      const dy = touch.clientY - gesture.y;
      const dx = touch.clientX - gesture.x;
      if (!gesture.session) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) < SLOP_PX) return;
        const down = gesture.atTop && dy > 0 && Math.abs(dy) > Math.abs(dx);
        gesture.session = down ? startDrag(() => latest.current, gesture.y + SLOP_PX) : null;
        if (!gesture.session) {
          gesture.scroll = true;
          return;
        }
      }
      event.preventDefault();
      gesture.session.move(touch.clientY);
    };
    const end = (cancelled: boolean) => () => {
      gesture?.session?.end(cancelled);
      gesture = null;
    };
    const finish = end(false);
    const cancel = end(true);
    body.addEventListener("touchstart", start, { passive: true });
    body.addEventListener("touchmove", move, { passive: false });
    body.addEventListener("touchend", finish);
    body.addEventListener("touchcancel", cancel);
    return () => {
      body.removeEventListener("touchstart", start);
      body.removeEventListener("touchmove", move);
      body.removeEventListener("touchend", finish);
      body.removeEventListener("touchcancel", cancel);
      gesture?.session?.end(true);
    };
  }, [body]);
}
