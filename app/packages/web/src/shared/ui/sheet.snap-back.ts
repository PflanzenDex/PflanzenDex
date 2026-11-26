import * as React from "react";
import { mergeRefs } from "@/shared/lib/utils";

/** Vaul's timing of a reset (`resetDrawer` of Vaul 1.1): half a second on the sheet and on its overlay. */
const SNAP_MS = 500;
const SNAP = `${SNAP_MS / 1000}s cubic-bezier(0.32, 0.72, 0, 1)`;

/**
 * Brings the sheet and its overlay back to their place. The sheet slides down with a drag on its handle and only comes
 * back by itself when the drag ends and the sheet stays open; a close that the parent refused (typed input unsaved,
 * US-QS-32) leaves it where the finger put it, so the sheet does it here. The inline transition goes again once it ran,
 * so the sheet's own transition between its heights (`tokens.css`, US-QS-15) applies afterwards.
 */
export function snapBack(sheet: HTMLElement | null, overlay: HTMLElement | null): void {
  if (sheet) {
    sheet.style.transition = `transform ${SNAP}`;
    sheet.style.transform = "translate3d(0, 0, 0)";
    window.setTimeout(() => {
      if (sheet.style.transition.startsWith("transform")) sheet.style.transition = "";
    }, SNAP_MS + 100);
  }
  if (overlay) {
    overlay.style.transition = `opacity ${SNAP}`;
    overlay.style.opacity = "1";
  }
}

/**
 * Snaps the sheet back at each close the parent refused (US-QS-32); a sheet that mounts after one does not move. Gives the
 * refs of the sheet and of its overlay; `observe` also gets the sheet's element (the height of the sheet reads it).
 */
export function useSnapBack(
  closeRefusals: number,
  ref: React.ForwardedRef<HTMLDivElement>,
  observe: (element: HTMLDivElement | null) => void,
) {
  const sheet = React.useRef<HTMLDivElement | null>(null);
  const overlay = React.useRef<HTMLDivElement | null>(null);
  // One callback per forwarded ref: a new one each render would make Vaul detach and attach the sheet on every render.
  const content = React.useMemo(() => mergeRefs(ref, sheet, observe), [ref, observe]);
  const seen = React.useRef(closeRefusals);
  React.useEffect(() => {
    if (closeRefusals === seen.current) return;
    seen.current = closeRefusals;
    snapBack(sheet.current, overlay.current);
  }, [closeRefusals]);
  return { content, overlay };
}
