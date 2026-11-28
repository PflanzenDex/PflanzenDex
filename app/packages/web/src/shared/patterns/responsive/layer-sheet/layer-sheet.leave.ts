import * as React from "react";
import { focusModalTitle } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { keptOpener, restoreFocus } from "./use-layer";
import { LayerHostContext } from "./layer-host/layer-host";

/**
 * Focus on open for a sheet or dialog (US-QS-15, issue 1363): on Back the control the layer was opened from takes the
 * focus when it is in the layer; otherwise the title does (`focusModalTitle`).
 */
export function focusLayerStart(event: Event, returning: boolean, editsStored = false): void {
  const back = returning ? keptOpener(event.currentTarget as HTMLElement | null) : null;
  if (!back) return focusModalTitle(event, editsStored);
  event.preventDefault();
  back.focus();
}

/**
 * The body of a layer stays while a sheet that closes slides out, so it leaves as it came (US-QS-15, F7). A layer that
 * another one replaces, and a pane at a desktop width, have no exit to keep content for: they leave at once.
 */
export function useLeavingBody(open: boolean, replaced: boolean, isLg: boolean) {
  const [leaving, setLeaving] = React.useState(false);
  const [shownOpen, setShownOpen] = React.useState(open);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (!open && !isLg && !replaced) setLeaving(true);
  }
  const onExited = React.useCallback(() => setLeaving(false), []);
  return { showBody: open || (leaving && !replaced), onExited };
}

/**
 * The focus leaves a layer with its address (US-QS-15, issue 1363, issue 1661): a close restores it, and so does an unmount
 * while the layer is open, because a layer mounted only while its address names it has no close of its own. StrictMode
 * unmounts and mounts each effect back to back, so the unmount restore waits a microtask and only a real unmount restores.
 */
export function useFocusOnLeave(open: boolean): void {
  const wasOpen = React.useRef(false);
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !open) restoreFocus();
    wasOpen.current = open;
  }, [open]);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (wasOpen.current) {
        queueMicrotask(() => {
          if (!mounted.current) restoreFocus();
        });
      }
    };
  }, []);
}

/** A pane that renders outside a `LayerHost` would stack below the list: the dev build says so (US-QS-15). */
export function useFrameWarning(id: string, active: boolean): void {
  const host = React.useContext(LayerHostContext);
  React.useEffect(() => {
    if (import.meta.env.DEV && active && !host) {
      console.warn(
        `LayerSheet "${id}" renders outside a LayerHost: its pane would stack below the list (US-QS-15).`,
      );
    }
  }, [host, id, active]);
}
