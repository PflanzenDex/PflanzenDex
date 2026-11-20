import * as React from "react";

/** Horizontal distance of a swipe that turns the page (starting value, assumption; US-QS-15). */
const SWIPE_PX = 48;

/** Pointer handlers that turn a horizontal swipe into a page change, as an alternative to the buttons. */
export function useSwipe(page: number, pages: number, turn: (delta: 1 | -1) => void) {
  const start = React.useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && page < pages) turn(1);
      if (dx > 0 && page > 1) turn(-1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
