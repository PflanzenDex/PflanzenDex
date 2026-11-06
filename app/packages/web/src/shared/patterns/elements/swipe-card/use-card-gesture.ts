import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import {
  DRAG_SLOP_PX,
  FLICK_FRESH_MS,
  gestureDirection,
  type SwipeDirection,
} from "./swipe-gesture";

/** Where a drag is now: the pointer moved `dx` and `dy` px from the press, with the card width and the speed (px per ms). */
export interface Drag {
  readonly dx: number;
  readonly dy: number;
  readonly width: number;
  readonly speed: number;
}

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly pointer: number | undefined;
}

/** The state of one press, kept in a ref: a press is no render, only the drag is. */
interface Gesture {
  start: Sample | null;
  last: Sample | null;
  moved: { readonly t: number; readonly speed: number };
  width: number;
  active: boolean;
  swallowClick: boolean;
}

const sample = (e: PointerEvent<HTMLElement>): Sample => ({
  x: e.clientX,
  y: e.clientY,
  t: e.timeStamp,
  pointer: e.pointerId,
});

/** A press starts: the card is measured and the press remembered. A mouse counts only with its main button. */
function press(g: Gesture, e: PointerEvent<HTMLElement>): void {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  g.swallowClick = false;
  g.width = e.currentTarget.clientWidth;
  g.start = sample(e);
  g.last = g.start;
  g.moved = { t: e.timeStamp, speed: 0 };
  g.active = false;
}

/** The pointer moves: the drag so far, or `null` while the pointer has not left the slop yet. */
function slide(g: Gesture, e: PointerEvent<HTMLElement>): Drag | null {
  const s = g.start;
  if (!s || e.pointerId !== s.pointer) return null;
  const dx = e.clientX - s.x;
  const dy = e.clientY - s.y;
  if (!g.active) {
    if (Math.hypot(dx, dy) < DRAG_SLOP_PX) return null;
    g.active = true;
    // Keeps the drag when the pointer leaves the card; touch has this already.
    if (typeof e.currentTarget.setPointerCapture === "function")
      e.currentTarget.setPointerCapture(e.pointerId);
  }
  const prev = g.last ?? s;
  const speed =
    Math.hypot(e.clientX - prev.x, e.clientY - prev.y) / Math.max(1, e.timeStamp - prev.t);
  g.moved = { t: e.timeStamp, speed };
  g.last = sample(e);
  return { dx, dy, width: g.width, speed };
}

/** The press ends: the direction it decides, or `null` for a tap and for a drag below the threshold. */
function release(g: Gesture, e: PointerEvent<HTMLElement>): SwipeDirection | null {
  const s = g.start;
  const dragged = g.active;
  g.start = null;
  g.active = false;
  if (!s) return null;
  const dx = e.clientX - s.x;
  const dy = e.clientY - s.y;
  // A release past the slop is a drag even when no move event came before it (a fast flick may skip them).
  if (!dragged && Math.hypot(dx, dy) < DRAG_SLOP_PX) return null;
  // A drag is no click: the button under the finger does not fire when the drag ends on it.
  g.swallowClick = true;
  const speed = e.timeStamp - g.moved.t <= FLICK_FRESH_MS ? g.moved.speed : 0;
  return gestureDirection({ dx, dy, width: g.width, speed });
}

/**
 * The pointer side of `SwipeCard` (US-ENT-01, US-TAU-02): a press becomes a drag past a small slop, the drag reports
 * where it is, and a release past the threshold reports its direction. `blocked` ignores new presses (busy, or a card
 * that is already flying off).
 */
export function useCardGesture(blocked: boolean, onSwipe: (d: SwipeDirection) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const g = useRef<Gesture>({
    start: null,
    last: null,
    moved: { t: 0, speed: 0 },
    width: 0,
    active: false,
    swallowClick: false,
  });
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (!blocked) press(g.current, e);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const next = slide(g.current, e);
      if (next !== null) setDrag(next);
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const direction = release(g.current, e);
      setDrag(null);
      if (direction !== null) onSwipe(direction);
    },
    onPointerCancel: () => {
      g.current.start = null;
      g.current.active = false;
      setDrag(null);
    },
    onClickCapture: (e: MouseEvent<HTMLDivElement>) => {
      if (!g.current.swallowClick) return;
      g.current.swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
  return { drag, handlers };
}
