import * as React from "react";
import {
  dragFrame,
  releaseOf,
  type DragBounds,
  type DragFrame,
  type Heights,
  type Release,
  type SheetKind,
} from "../detents";

type Drag = {
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

/**
 * The drag on the handle of a sheet (US-QS-15): the handle changes the height and only the handle does (the content of
 * the sheet scrolls, Vaul's own drag is off). Between half and full height the sheet follows the finger in height; below
 * the lowest height it keeps that height and slides down. The slide is written to the element, because it is the pointer's,
 * not the render's, and it stays while a close that the parent has not yet answered runs (the exit animation starts there).
 * The move and the end are read on the window, so a finger or a mouse that leaves the handle still drags it.
 * Returns the pointer handler of the handle.
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
    const { sheet, kind, heights } = latest.current;
    if (!sheet || stop.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const { pointerId, clientY: startY } = event;
    const start = sheet.offsetHeight;
    const bounds = boundsOf(kind, heights, start);
    let frame: DragFrame = { height: start, offset: 0 };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      frame = dragFrame(start - (e.clientY - startY), bounds);
      sheet.style.transition = "none";
      sheet.style.transform = frame.offset > 0 ? `translate3d(0, ${frame.offset}px, 0)` : "";
      if (kind === "two") latest.current.onHeight(frame.height);
    };
    const end = (cancelled: boolean) => (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      stop.current?.();
      const release = cancelled
        ? { close: false, detent: null }
        : releaseOf(frame, latest.current.heights, kind, bounds.lowest);
      sheet.style.transition = "";
      // A sheet that closes keeps its place for the exit; one that stays slides back and takes its height.
      if (!release.close) {
        sheet.style.transform = "";
        latest.current.onHeight(null);
      }
      latest.current.onRelease(release);
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
