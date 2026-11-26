import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigationType } from "react-router";
import { Button } from "@/shared/ui/button";
import { ResponsiveModal } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { useIsLg } from "@/shared/platform/visibility/use-lg-breakpoint";
import { UnsavedQuestion } from "@/shared/patterns/responsive/unsaved-input-dialog/unsaved-question/unsaved-question";
import { LayerGuardContext, layerOpenerId, useLayer } from "./use-layer";
import { useLayerGuard, type LayerGuard } from "./layer-sheet.guard";
import { LayerHostContext } from "./layer-host/layer-host";
import {
  focusLayerStart,
  useFocusOnLeave,
  useFrameWarning,
  useLeavingBody,
} from "./layer-sheet.leave";
import { LayerBody, LayerPane } from "./layer-host/layer-pane/layer-pane";

export { useExitValue, useLayer } from "./use-layer";
export { useKeptWhileUnsaved } from "./layer-sheet.history";
export { useUnsavedInput } from "./use-layer";
export { LayerHost } from "./layer-host/layer-host";

/** A button that opens the layer `id` (US-QS-15); tinted by default, because a layer owns the one filled action. */
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
      variant="tinted"
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

/** Provides the guard to the forms of a layer; the question sits beside the layer, not inside its pane or sheet. */
export function LayerGuarded(props: { guard: LayerGuard; children: React.ReactNode }) {
  const { guard } = props;
  return (
    <LayerGuardContext.Provider value={guard.value}>
      {props.children}
      {guard.asking ? <UnsavedQuestion onKeep={guard.keep} onDiscard={guard.discard} /> : null}
    </LayerGuardContext.Provider>
  );
}

export type LayerSheetProps = {
  /** The value of `?sheet=`. */
  id: string;
  /** The layer heading and its accessible name. */
  title: string;
  /** The one filled primary action of the layer (US-QS-15); everything else is a tinted or plain button, a row or a tile. */
  primaryAction?: React.ReactNode;
  /**
   * Actions that stay under the title, above the content, which scrolls under them (US-QS-15, owner decision 2026-11-22,
   * issue 2424: the quick actions of a plant). The one filled action among them is the layer's primary action; the sheet
   * counts them with its header for the heights.
   */
  topAction?: React.ReactNode;
  /** Accessible name of the close button (German). */
  closeLabel?: string;
  /**
   * The layer opens at half height at least below 768 px, also while its content is short (US-QS-15, owner decision 2026-11-22, issue 2424): for
   * a layer with a list of unknown length, such as the news, so it does not grow from a small sheet to half height while the
   * list loads. A dialog and a pane are not affected.
   */
  halfHeight?: boolean;
  children: React.ReactNode;
};

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
  topAction,
  closeLabel = "Schließen",
  halfHeight = false,
  children,
}: LayerSheetProps) {
  const { open, replaced, closeLayer } = useLayer(id);
  // A close the person asks for goes through the guard: typed input that is not saved asks first (US-QS-32).
  const guard = useLayerGuard(id, open, closeLayer);
  // A layer that a second Back passed with unsaved input stays on screen, with its body, until its question is answered
  // (issue 2145): the address alone would close it in this render.
  const shown = open || guard.held;
  const isLg = useIsLg();
  const host = React.useContext(LayerHostContext);
  const pane = host?.pane ?? null;
  // A layer that mounts on Back (a POP) is one that was left for a layer above it: its opener may be back (issue 1363).
  const returning = useNavigationType() === "POP";
  const { showBody, onExited } = useLeavingBody(shown, replaced, isLg);
  useFocusOnLeave(shown);
  useFrameWarning(id, open && isLg);
  // What stays in place around the content: the quick actions above it and the primary action below it.
  const actions = { primaryAction, topAction };

  if (isLg) {
    if (!shown) return null;
    const layer = (
      <LayerPane
        id={id}
        title={title}
        {...actions}
        closeLabel={closeLabel}
        onClose={guard.requestClose}
        returning={returning}
      >
        {children}
      </LayerPane>
    );
    // Without a frame the pane stays where it is (the dev warning above says so); inside one it goes to its pane column.
    if (!host) return <LayerGuarded guard={guard}>{layer}</LayerGuarded>;
    return pane ? <LayerGuarded guard={guard}>{createPortal(layer, pane)}</LayerGuarded> : null;
  }
  return (
    <LayerGuarded guard={guard}>
      <ResponsiveModal
        title={title}
        closeLabel={closeLabel}
        open={shown}
        onOpenChange={(next) => {
          if (!next) guard.requestClose();
        }}
        onOpenAutoFocus={(event) => focusLayerStart(event, returning)}
        onExited={onExited}
        closeRefusals={guard.refusals}
        halfHeight={halfHeight}
      >
        {/* The modal keeps its children mounted when closed; a closed layer must not load data or hold a pager (US-QS-22),
            so the body renders only while the layer is open or still leaving (US-QS-15, F7). */}
        {showBody ? <LayerBody {...actions}>{children}</LayerBody> : null}
      </ResponsiveModal>
    </LayerGuarded>
  );
}
