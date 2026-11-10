import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigationType } from "react-router";
import { Button } from "@/shared/ui/button/button";
import {
  ResponsiveModal,
  focusModalTitle,
} from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { useIsLg } from "@/shared/platform/browser/use-breakpoint";
import { keptOpener, layerOpenerId, restoreFocus, useLayer } from "./use-layer";
import { LayerHostContext } from "./layer-host/layer-host";
import { LayerBody, LayerPane } from "./layer-host/layer-pane/layer-pane";

export { useExitValue, useLayer } from "./use-layer";
export { LayerHost } from "./layer-host/layer-host";

/** A button that opens the layer `id` (US-QS-15); outline by default, because a layer owns the one filled action. */
export function LayerOpener({
  id,
  children,
  className,
  size,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** `sm` gives the control radius instead of the pill, e.g. for a tile (issue 1092). */
  size?: "sm";
}) {
  const { openLayer, open } = useLayer(id);
  return (
    <Button
      id={layerOpenerId(id)}
      type="button"
      variant="outline"
      {...(size ? { size } : {})}
      className={className}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      {children}
    </Button>
  );
}

export type LayerSheetProps = {
  /** The value of `?sheet=`. */
  id: string;
  /** The layer heading and its accessible name. */
  title: string;
  /** The one filled primary action of the layer (US-QS-15); everything else is outline, a row or a tile. */
  primaryAction?: React.ReactNode;
  /** Accessible name of the close button (German). */
  closeLabel?: string;
  children: React.ReactNode;
};

/**
 * Focus on open for a sheet or dialog (US-QS-15, issue 1363): on Back the control the layer was opened from takes the
 * focus when it is in the layer; otherwise the title does (`focusModalTitle`).
 */
function focusLayerStart(event: Event, returning: boolean): void {
  const back = returning ? keptOpener(event.currentTarget as HTMLElement | null) : null;
  if (!back) return focusModalTitle(event);
  event.preventDefault();
  back.focus();
}

/**
 * The body of a layer stays while a sheet that closes slides out, so it leaves as it came (US-QS-15, F7). A layer that
 * another one replaces, and a pane at a desktop width, have no exit to keep content for: they leave at once.
 */
function useLeavingBody(open: boolean, replaced: boolean, isLg: boolean) {
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
function useFocusOnLeave(open: boolean): void {
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

/**
 * Layer above an overview (US-QS-15, DS-58): open while the address holds `?sheet=<id>`, so Back closes it and a
 * reload or copied link reopens it. Below 768 px a bottom sheet, from 768 px a dialog, from 1024 px a pane beside the
 * content of its `LayerHost`, which is as tall as the viewport less the frame's padding and scrolls inside itself.
 * Focus moves to the layer and returns to the opener; Escape closes; scrolling stays inside the layer.
 */
export function LayerSheet({
  id,
  title,
  primaryAction,
  closeLabel = "Schließen",
  children,
}: LayerSheetProps) {
  const { open, replaced, closeLayer } = useLayer(id);
  const isLg = useIsLg();
  const host = React.useContext(LayerHostContext);
  const pane = host?.pane ?? null;
  // A layer that mounts on Back (a POP) is one that was left for a layer above it: its opener may be back (issue 1363).
  const returning = useNavigationType() === "POP";
  const { showBody, onExited } = useLeavingBody(open, replaced, isLg);
  useFocusOnLeave(open);

  React.useEffect(() => {
    if (import.meta.env.DEV && open && isLg && !host) {
      console.warn(
        `LayerSheet "${id}" renders outside a LayerHost: its pane would stack below the list (US-QS-15).`,
      );
    }
  }, [host, id, isLg, open]);

  if (isLg) {
    if (!open) return null;
    const layer = (
      <LayerPane
        id={id}
        title={title}
        primaryAction={primaryAction}
        closeLabel={closeLabel}
        onClose={closeLayer}
        returning={returning}
      >
        {children}
      </LayerPane>
    );
    // Without a frame the pane stays where it is (the dev warning above says so); inside one it goes to its pane column.
    if (!host) return layer;
    return pane ? createPortal(layer, pane) : null;
  }
  return (
    <ResponsiveModal
      title={title}
      closeLabel={closeLabel}
      open={open}
      onOpenChange={(next) => {
        if (!next) closeLayer();
      }}
      onOpenAutoFocus={(event) => focusLayerStart(event, returning)}
      onExited={onExited}
    >
      {/* The modal keeps its children mounted when closed; a closed layer must not load data or hold a pager (US-QS-22),
          so the body renders only while the layer is open or still leaving (US-QS-15, F7). */}
      {showBody ? <LayerBody primaryAction={primaryAction}>{children}</LayerBody> : null}
    </ResponsiveModal>
  );
}
