import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button/button";
import { ResponsiveModal } from "@/components/shared/responsive/responsive-modal/responsive-modal";
import { useIsLg } from "@/lib/use-breakpoint";

const PARAM = "sheet";
/** History state set when the app itself opened the layer, so closing can go back instead of leaving the app. */
const FROM_APP = "layerFromApp";

/** The element that opened the layer; focus returns to it when the layer closes (US-QS-15). */
let opener: HTMLElement | null = null;

export type LayerControl = {
  open: boolean;
  /** Opens the layer: pushes a history entry, so Back closes it. Pass the event target to return focus to it. */
  openLayer: (from?: HTMLElement | null) => void;
  /** Closes the layer: back when the app opened it, otherwise it only removes the address part. */
  closeLayer: () => void;
};

/** State and actions of the layer `id` from the address `?sheet=<id>` (US-QS-15). Use it to build an opener. */
export function useLayer(id: string): LayerControl {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const open = params.get(PARAM) === id;
  const fromApp = (location.state as Record<string, unknown> | null)?.[FROM_APP] === true;
  return {
    open,
    openLayer: (from) => {
      opener = from ?? (document.activeElement as HTMLElement | null);
      const next = new URLSearchParams(params);
      next.set(PARAM, id);
      // `keepFocus`: the layer takes the focus itself, the view behind it must not move it to its heading (RouteFocus).
      setParams(next, { state: { [FROM_APP]: true, keepFocus: true } });
    },
    closeLayer: () => {
      if (fromApp) {
        void navigate(-1);
        return;
      }
      const next = new URLSearchParams(params);
      next.delete(PARAM);
      setParams(next, { replace: true });
    },
  };
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

function restoreFocus() {
  const target = opener;
  opener = null;
  if (target?.isConnected) target.focus();
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

/**
 * Layer above an overview (US-QS-15, DS-58): open while the address holds `?sheet=<id>`, so Back closes it and a
 * reload or copied link reopens it. Below 768 px a bottom sheet, from 768 px a dialog, from 1024 px a pane beside the
 * list: render `LayerSheet` as a sibling of the list inside a flex row, the pane takes its own column. Focus moves to
 * the layer and returns to the opener; Escape closes; scrolling stays inside the layer.
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
  const heading = React.useRef<HTMLHeadingElement>(null);
  const wasOpen = React.useRef(false);

  React.useEffect(() => {
    if (open && isLg) heading.current?.focus();
    if (wasOpen.current && !open) restoreFocus();
    wasOpen.current = open;
  }, [open, isLg]);

  if (isLg) {
    if (!open) return null;
    return (
      <aside
        aria-labelledby={`layer-${id}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeLayer();
        }}
        className="flex max-h-full w-96 shrink-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
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
          <Button type="button" variant="ghost" size="sm" onClick={closeLayer}>
            {closeLabel}
          </Button>
        </div>
        <LayerBody primaryAction={primaryAction}>{children}</LayerBody>
      </aside>
    );
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
