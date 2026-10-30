import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button/button";
import { ResponsiveModal } from "@/components/shared/responsive/responsive-modal/responsive-modal";
import { useIsLg } from "@/lib/use-breakpoint";
import { cn } from "@/lib/utils";
import { restoreFocus, useLayer } from "./use-layer";

export { useLayer } from "./use-layer";

/** The pane column of a `LayerHost`: hidden while empty, so it adds no gap (US-QS-15, US-QS-18). */
const PANE_SLOT = "hidden lg:flex lg:shrink-0 lg:flex-col lg:self-start lg:empty:hidden";

type LayerHostState = { pane: HTMLDivElement | null } | null;
const LayerHostContext = React.createContext<LayerHostState>(null);

export type LayerHostProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: React.ReactNode;
  /** Classes of the content column, e.g. its gap or its height; the frame itself takes `className`. */
  contentClassName?: string;
};

/**
 * The frame of a destination with layers (US-QS-15, DS-59): the content in one column; from 1024 px the pane of an open
 * layer takes the second column beside it. Every `LayerSheet` inside renders its pane here, in whatever component it
 * sits, so a layer never stacks below the list. Render one frame at the top of each destination: the pane then starts
 * where the content starts and reaches to the bottom of the viewport.
 */
export function LayerHost({ children, className, contentClassName, ...rest }: LayerHostProps) {
  const [pane, setPane] = React.useState<HTMLDivElement | null>(null);
  const value = React.useMemo(() => ({ pane }), [pane]);
  const frame = cn("flex min-w-0 flex-col lg:flex-row lg:gap-4", className);
  return (
    <LayerHostContext.Provider value={value}>
      <div data-layer-host="" {...rest} className={frame}>
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", contentClassName)}>
          {children}
        </div>
        <div ref={setPane} className={PANE_SLOT} />
      </div>
    </LayerHostContext.Provider>
  );
}

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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {primaryAction ? <div className="flex flex-col gap-2">{primaryAction}</div> : null}
    </div>
  );
}

/** The pane of an open layer from 1024 px. Its heading takes the focus when the pane mounts; Escape closes it. */
function LayerPane({
  id,
  title,
  primaryAction,
  closeLabel = "Schließen",
  onClose,
  children,
}: LayerSheetProps & { primaryAction?: React.ReactNode | undefined; onClose: () => void }) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <aside
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
    >
      {/* The modal keeps its children mounted when closed; a closed layer must not load data or hold a pager (US-QS-22). */}
      {open ? <LayerBody primaryAction={primaryAction}>{children}</LayerBody> : null}
    </ResponsiveModal>
  );
}
