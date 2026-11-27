import * as React from "react";
import {
  dragFrame,
  releaseOf,
  type DragBounds,
  type DragFrame,
  type Heights,
  type Release,
  type SheetKind,
} from "./sheet.detents";

export type Drag = {
  /** The sheet's element: it slides down with the drag, and its height is where the drag starts. */
  sheet: HTMLElement | null;
  kind: SheetKind;
  heights: Heights;
  /** The height a drag of a sheet with two heights asks for; `null` when the drag is over or changes no height. */
  onHeight: (height: number | null) => void;
  /** The drag is over: close the sheet, or snap it to a height. */
  onRelease: (release: Release) => void;
};

/** The heights a drag moves between: a sheet with two heights between them, a sheet with one height at that one. */
function boundsOf(kind: SheetKind, heights: Heights, start: number): DragBounds {
  if (kind === "two") return { lowest: heights.half, highest: heights.full };
  return { lowest: start, highest: start };
}

/** One drag of the sheet: where the finger is (`move`) and that it lets go or is taken away (`end`). */
export type Session = { move: (y: number) => void; end: (cancelled: boolean) => void };

/**
 * Starts a drag of the sheet at the finger's height `startY` (US-QS-15), from the handle or from a swipe on the content. Between
 * half and full height the sheet follows the finger in height; below the lowest height it keeps that height and slides down.
 * The slide is written to the element, because it is the pointer's, not the render's, and it stays while a close that the
 * parent has not yet answered runs (the exit animation starts there). `latest` gives the current options at each step.
 */
export function startDrag(latest: () => Drag, startY: number): Session | null {
  const { sheet, kind, heights } = latest();
  if (!sheet) return null;
  const start = sheet.offsetHeight;
  const bounds = boundsOf(kind, heights, start);
  let frame: DragFrame = { height: start, offset: 0 };
  return {
    move: (y) => {
      frame = dragFrame(start - (y - startY), bounds);
      sheet.style.transition = "none";
      sheet.style.transform = frame.offset > 0 ? `translate3d(0, ${frame.offset}px, 0)` : "";
      if (kind === "two") latest().onHeight(frame.height);
    },
    end: (cancelled) => {
      const now = latest();
      const release = cancelled
        ? { close: false, detent: null }
        : releaseOf(frame, now.heights, kind, bounds.lowest);
      sheet.style.transition = "";
      // A sheet that closes keeps its place for the exit; one that stays slides back and takes its height.
      if (!release.close) {
        sheet.style.transform = "";
        now.onHeight(null);
      }
      now.onRelease(release);
    },
  };
}

/**
 * The drag on the handle of a sheet (US-QS-15): the handle changes the height; Vaul's own drag is off, and a swipe on the
 * content is `useContentSwipe`. The move and the end are read on the window, so a finger or a mouse that leaves the handle
 * still drags it. Returns the pointer handler of the handle.
 */
export function useHandleDrag(drag: Drag) {
  const latest = React.useRef(drag);
  React.useEffect(() => {
    latest.current = drag;
  });
  // Ends the drag that runs: its listeners go; a drag that the page leaves (the sheet unmounts) ends the same way.
  const stop = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => stop.current?.(), []);
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (stop.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const { pointerId } = event;
    const session = startDrag(() => latest.current, event.clientY);
    if (!session) return;
    const move = (e: PointerEvent) => {
      if (e.pointerId === pointerId) session.move(e.clientY);
    };
    const end = (cancelled: boolean) => (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      stop.current?.();
      session.end(cancelled);
    };
    const up = end(false);
    const cancel = end(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    stop.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      stop.current = null;
    };
  };
  return { onPointerDown };
}
