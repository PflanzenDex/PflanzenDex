import * as React from "react";
import { Drawer } from "vaul";
import { cn } from "@/shared/lib/utils";
import { StatusBarDim } from "@/shared/platform/device/status-bar/status-bar";
import { LayerScope } from "../../layer-scope/layer-scope";
import { SheetHandle } from "./height/sheet-handle/sheet-handle";
import { useSnapBack } from "./height/sheet-handle/snap-back";
import { useCrampedWindow } from "./height/use-cramped";
import { useSheetHeight } from "./height/use-sheet-height";
import { useSheetFocus } from "./open-focus";
import { TitleRow } from "./title-row/title-row";

export type SheetPanelProps = Omit<
  React.ComponentPropsWithoutRef<typeof Drawer.Content>,
  "title"
> & {
  /** Required: the accessible name of the sheet (DS-40). */
  title: string;
  /** Optional description linked to the sheet. */
  description?: string;
  /** Required: the accessible name of the close button (German, from the caller; SG-SHEET-02). */
  closeLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How often the parent refused a close (US-QS-32): each one snaps the sheet back to its place. */
  closeRefusals?: number;
  /** Receives the sheet's bar slot (US-QS-32, SG-SHEET-04): the element a form draws its actions into; `null` when it leaves. */
  onBarSlot?: (element: HTMLElement | null) => void;
  /** A form has drawn actions into the bar: "Abbrechen" is the close control and the X is gone. */
  barActive?: boolean;
};

/**
 * The look of the sheet. Its height comes from two CSS variables that `useSheetHeight` sets (`--sheet-height`, `--sheet-max`;
 * without them the sheet is as high as its content, at most 90 %). The class `has-[[data-page-fit]]:h-[90dvh]` gives a list that pages by free height (`data-page-fit`)
 * the full height to fill (issue 1156); the sheet's own height (US-QS-15) leaves a sheet with such a list as it is until
 * `Pager` is replaced.
 */
const SHEET =
  "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-(--sheet-height) max-h-[var(--sheet-max,90dvh)] flex-col rounded-t-card bg-card shadow-elevation-2 pb-[env(safe-area-inset-bottom)] text-foreground has-[[data-page-fit]]:h-[90dvh]";

/** The backdrop; it dims the status bar as long as it is on screen. */
function Scrim(props: { overlay: React.Ref<HTMLDivElement> }) {
  return (
    <Drawer.Overlay ref={props.overlay} className="fixed inset-0 z-50 bg-scrim">
      <StatusBarDim />
    </Drawer.Overlay>
  );
}

/** The optional description linked to the sheet. */
function SheetDescription(props: { text: string | undefined }) {
  if (!props.text) return null;
  return (
    <Drawer.Description className="px-4 text-sm text-muted-foreground">
      {props.text}
    </Drawer.Description>
  );
}

type SheetHeaderProps = {
  title: string;
  description: string | undefined;
  closeLabel: string;
  onBarSlot: ((element: HTMLElement | null) => void) | undefined;
  barActive: boolean | undefined;
  height: ReturnType<typeof useSheetHeight>;
  cramped: boolean;
  close: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

/** What stays in place above the body: the handle, the title row with the toggle of the height and the close button, the description. */
function SheetHeader({ height, cramped, ...props }: SheetHeaderProps) {
  return (
    <div ref={height.headerRef} data-sheet-header="" className="shrink-0">
      {cramped ? null : <SheetHandle drag={height.drag} keys={height.keys} />}
      <TitleRow
        title={props.title}
        closeLabel={props.closeLabel}
        close={props.close}
        onClose={props.onClose}
        barSlot={props.onBarSlot}
        barActive={props.barActive}
        compact={cramped}
        toggle={height.toggle}
        handle={!cramped}
      />
      <SheetDescription text={props.description} />
    </div>
  );
}

/**
 * The scrolling body of the sheet: it scrolls, the header above it stays (DS-61, US-QS-15). A layer inside it (`LayerBody`)
 * is a column that takes the height of the body, so its content scrolls under the layer's action, which stays.
 */
function SheetBody(props: { children: React.ReactNode; ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={props.ref}
      data-sheet-body=""
      data-scroll-region=""
      className="overflow-y-auto overscroll-contain p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring has-[[data-layer-body]]:flex has-[[data-layer-body]]:min-h-0 has-[[data-layer-body]]:flex-1 has-[[data-layer-body]]:flex-col has-[[data-page-fit]]:flex has-[[data-page-fit]]:min-h-0 has-[[data-page-fit]]:flex-1 has-[[data-page-fit]]:flex-col"
    >
      <LayerScope.Provider value>{props.children}</LayerScope.Provider>
    </div>
  );
}

/**
 * The Vaul part of the bottom sheet (US-QS-07, DS-23, DS-40, DS-08): handle, safe-area padding, the heights of US-QS-15.
 * `autoFocus` is required: Vaul 1.1 cancels Radix's focus-on-open by default, which left the focus on the trigger
 * and Tab walking the page behind the sheet (US-QS-14, issue 604, WCAG 2.4.3). `handleOnly` turns Vaul's own drag off:
 * the sheet's height changes by the handle only (`useSheetHeight`), and a swipe on the content scrolls it.
 * Only `sheet.tsx` imports this file, and only through a dynamic import, so Vaul and the height code stay out of the
 * initial JS.
 */
const SheetPanel = React.forwardRef<HTMLDivElement, SheetPanelProps>(
  (
    {
      className,
      title,
      description,
      closeLabel,
      children,
      open,
      onOpenChange,
      onOpenAutoFocus,
      onCloseAutoFocus,
      closeRefusals = 0,
      onBarSlot,
      barActive,
      ...props
    },
    ref,
  ) => {
    const focus = useSheetFocus(onOpenAutoFocus, onCloseAutoFocus);
    const [sheet, setSheet] = React.useState<HTMLDivElement | null>(null);
    const { content, overlay } = useSnapBack(closeRefusals, ref, setSheet);
    const cramped = useCrampedWindow(barActive === true);
    const height = useSheetHeight({ title, open, sheet, cramped, closeRefusals, onOpenChange });
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus handleOnly>
        <Drawer.Portal>
          <Scrim overlay={overlay} />
          <Drawer.Content
            ref={content}
            className={cn(SHEET, className)}
            {...props}
            {...height.attributes}
            onOpenAutoFocus={focus.onOpenAutoFocus}
            onCloseAutoFocus={focus.onCloseAutoFocus}
          >
            <SheetHeader
              height={height}
              cramped={cramped}
              title={title}
              description={description}
              closeLabel={closeLabel}
              close={focus.close}
              onClose={() => onOpenChange(false)}
              onBarSlot={onBarSlot}
              barActive={barActive}
            />
            <SheetBody ref={height.bodyRef}>{children}</SheetBody>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  },
);
SheetPanel.displayName = "SheetPanel";

export default SheetPanel;
