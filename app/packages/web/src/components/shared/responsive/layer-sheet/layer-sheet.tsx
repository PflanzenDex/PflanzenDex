import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button/button";
import {
  ResponsiveModal,
  focusModalTitle,
  leadingTextField,
} from "@/components/shared/responsive/responsive-modal/responsive-modal";
import { useIsLg } from "@/lib/use-breakpoint";
import { restoreFocus, useLayer } from "./use-layer";
import { LayerHostContext } from "./layer-host/layer-host";

export { useLayer } from "./use-layer";
export { LayerHost } from "./layer-host/layer-host";

/** A button that opens the layer `id` (US-QS-15); outline by default, because a layer owns the one filled action. */
export function LayerOpener({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { openLayer, open } = useLayer(id);
  return (
    <Button
      type="button"
      variant="outline"
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

function LayerBody({
  children,
  primaryAction,
}: {
  children: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  return (
    <div data-layer-body="" className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Below lg the sheet or dialog around it scrolls, so a sticky bar inside sticks to that; from lg the pane scrolls this region. */}
      <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">{children}</div>
      {primaryAction ? <div className="flex flex-col gap-2">{primaryAction}</div> : null}
    </div>
  );
}

/**
 * The pane of an open layer from 1024 px. Its heading takes the focus when the pane mounts, unless the layer starts with
 * a text field, which keeps it as in the sheet and dialog (`focusModalTitle`, issue 1104); Escape closes it.
 */
function LayerPane({
  id,
  title,
  primaryAction,
  closeLabel = "Schließen",
  onClose,
  children,
}: LayerSheetProps & { primaryAction?: React.ReactNode | undefined; onClose: () => void }) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  const pane = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    // The pane's own close button comes first, so the text field is looked for in the layer's body.
    const body = pane.current?.querySelector<HTMLElement>("[data-layer-body]") ?? null;
    (leadingTextField(body) ?? heading.current)?.focus();
  }, []);
  return (
    <aside
      ref={pane}
      data-layer-pane=""
      aria-labelledby={`layer-${id}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="flex max-h-[calc(100dvh-3rem)] w-96 shrink-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-start justify-between gap-2">
        <h2
          id={`layer-${id}`}
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold focus-visible:outline-none"
        >
          {title}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
      <LayerBody primaryAction={primaryAction}>{children}</LayerBody>
    </aside>
  );
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
  const { open, closeLayer } = useLayer(id);
  const isLg = useIsLg();
  const host = React.useContext(LayerHostContext);
  const pane = host?.pane ?? null;
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (wasOpen.current && !open) restoreFocus();
    wasOpen.current = open;
  }, [open]);

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
      onOpenAutoFocus={focusModalTitle}
    >
      {/* The modal keeps its children mounted when closed; a closed layer must not load data or hold a pager (US-QS-22). */}
      {open ? <LayerBody primaryAction={primaryAction}>{children}</LayerBody> : null}
    </ResponsiveModal>
  );
}
