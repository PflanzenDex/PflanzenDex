import * as React from "react";
import { Button } from "@/shared/ui/button";
import { leadingTextField } from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { LayerScope } from "@/shared/ui/layer-scope";
import { useScrollAccess } from "@/shared/ui/dialog.scroll-access";
import { FormBarHostContext, usePinnedBarHost } from "@/shared/ui/form-bar.host";
import { PinnedBar } from "@/shared/ui/form-bar.slot";
import { keptOpener } from "../../use-layer";

/** The body of a layer, shared by the pane and by the sheet or dialog around it (US-QS-15). */
export function LayerBody({
  children,
  primaryAction,
  topAction,
}: {
  children: React.ReactNode;
  primaryAction?: React.ReactNode;
  topAction?: React.ReactNode;
}) {
  const [region, setRegion] = React.useState<HTMLElement | null>(null);
  useScrollAccess(region);
  return (
    <div data-layer-body="" className="flex min-h-0 flex-1 flex-col gap-4">
      {/* The quick actions of a layer stay under its title, above the scroll region, so the filled one never scrolls away (US-QS-15). The sheet counts them with its header for the heights, as the primary action below. */}
      {topAction ? (
        <div data-sheet-pinned="" className="flex flex-col gap-2">
          {topAction}
        </div>
      ) : null}
      {/* The content of the layer is the scroll region of the sheet, the dialog and the pane: the title and the primary action stay (US-QS-15). */}
      {/* A word wider than the layer breaks at a syllable with a hyphen, as in the rows of a list (DS-63): a long name of a plant no longer widens the layer at 200 % text. */}
      {/* The margin and the padding are the 1 rem that the sheet, the dialog and the pane keep around the content: the region reaches to their edge, so the focus ring of a control at its edge is not clipped and a content that is a little too wide spills into the padding, as it did before the region scrolled. */}
      <div
        ref={setRegion}
        data-scroll-region=""
        className="-m-4 min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere] hyphens-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <LayerScope.Provider value>{children}</LayerScope.Provider>
      </div>
      {/* The sheet adds the height of what stays in place to its header, to see whether half height holds title and actions (US-QS-15). */}
      {primaryAction ? (
        <div data-sheet-pinned="" className="flex flex-col gap-2">
          {primaryAction}
        </div>
      ) : null}
    </div>
  );
}

type LayerPaneProps = {
  /** The value of `?sheet=`. */
  id: string;
  title: string;
  primaryAction?: React.ReactNode | undefined;
  topAction?: React.ReactNode | undefined;
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
  topAction,
  closeLabel = "Schließen",
  onClose,
  returning,
  children,
}: LayerPaneProps) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  const pane = React.useRef<HTMLElement>(null);
  // The actions of a form in the pane stand in its bar, pinned under the body; "Abbrechen" closes through the guard (US-QS-32, d-115).
  const { host: barHost, setSlot } = usePinnedBarHost(onClose);
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
      // The pane takes the height that is left in its column (`min-h-0` and `shrink`: a column that a frame of a given height
      // stretches holds it), so a pane that starts below a title never pushes the frame past the window; the cap of the window
      // height only bounds a pane in a frame whose height is not given (US-QS-15, DS-61).
      className="flex max-h-[calc(100dvh-3rem)] min-h-0 w-96 shrink flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
    >
      {/* One scope for the whole pane, as the sheet and the dialog give it: the title row and the primary action are in it too (SG-LIST-01). */}
      <LayerScope.Provider value>
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
        <FormBarHostContext.Provider value={barHost}>
          <LayerBody primaryAction={primaryAction} topAction={topAction}>
            {children}
          </LayerBody>
        </FormBarHostContext.Provider>
        {/* The bar of a form: pinned under the body, outside its scroll region (US-QS-32, owner decision d-115). */}
        <PinnedBar slotRef={setSlot} />
      </LayerScope.Provider>
    </aside>
  );
}
