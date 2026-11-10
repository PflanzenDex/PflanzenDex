import * as React from "react";
import { Button } from "@/shared/ui/button/button";
import { leadingTextField } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { cn } from "@/shared/lib/utils";
import { keptOpener } from "../../use-layer";

/**
 * A layer whose list pages by its free height (`Pager` with `fit`, marked `data-page-fit`) takes the full height of its
 * sheet, dialog or pane: a layer sized by its content has no free height, so the list would hold every entry and the
 * layer would scroll (US-QS-15, issue 1156). The regions between the layer and its list pass the height down as a flex
 * column; other layers keep the height and flow of their content.
 */
const FIT_FLEX = "has-[[data-page-fit]]:flex has-[[data-page-fit]]:flex-col";

/** The body of a layer, shared by the pane and by the sheet or dialog around it (US-QS-15). */
export function LayerBody({
  children,
  primaryAction,
}: {
  children: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  return (
    <div data-layer-body="" className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Below lg the sheet or dialog around it scrolls, so a sticky bar inside sticks to that; from lg the pane scrolls this region. */}
      {/* A list that pages by free height (`data-page-fit`) needs this region to pass the height down (issue 1156). */}
      <div className={cn("min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain", FIT_FLEX)}>
        {children}
      </div>
      {primaryAction ? <div className="flex flex-col gap-2">{primaryAction}</div> : null}
    </div>
  );
}

type LayerPaneProps = {
  /** The value of `?sheet=`. */
  id: string;
  title: string;
  primaryAction?: React.ReactNode | undefined;
  closeLabel?: string;
  onClose: () => void;
  /** Whether the pane mounts on Back (a POP); read once, when it mounts. */
  returning: boolean;
  children: React.ReactNode;
};

/**
 * The pane of an open layer from 1024 px. Its heading takes the focus when the pane mounts, unless the layer starts with
 * a text field, which keeps it as in the sheet and dialog (`focusModalTitle`, issue 1104); Escape closes it. A pane that
 * mounts on Back takes the focus on the control it was opened from, if that control is in it (issue 1363).
 */
export function LayerPane({
  id,
  title,
  primaryAction,
  closeLabel = "Schließen",
  onClose,
  returning,
  children,
}: LayerPaneProps) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  const pane = React.useRef<HTMLElement>(null);
  const onBack = React.useRef(returning);
  React.useEffect(() => {
    // The pane's own close button comes first, so the text field is looked for in the layer's body.
    const body = pane.current?.querySelector<HTMLElement>("[data-layer-body]") ?? null;
    const back = onBack.current ? keptOpener(pane.current) : null;
    (back ?? leadingTextField(body) ?? heading.current)?.focus();
  }, []);
  return (
    <aside
      ref={pane}
      data-layer-pane=""
      aria-labelledby={`layer-${id}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="flex max-h-[calc(100dvh-3rem)] w-96 shrink-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground has-[[data-page-fit]]:h-[calc(100dvh-3rem)]"
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
