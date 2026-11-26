import * as React from "react";
import { createPortal } from "react-dom";
import { LayerScope } from "@/shared/ui/layer-scope";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/sheet";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { returnFocusOnClose } from "@/shared/platform/routing/route-focus/view-start";
import { FormBarHostContext, useModalBarHost } from "@/shared/ui/form-bar.host";
import { DialogPart } from "./dialog-part/dialog-part";
import { useOpenState, usePreloadDialog } from "./responsive-modal.state";

const TEXT_FIELD =
  "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])";
// A close button marked `data-close`, and the handle and the toggle of the height of a sheet (`data-sheet-chrome`, US-QS-15),
// are chrome, not the content of the layer: they never count as the first control (US-QS-32).
const CONTROL = `${TEXT_FIELD}, button:not([disabled]):not([data-close]):not([data-sheet-chrome]), a[href], [tabindex]:not([tabindex='-1']):not([data-sheet-chrome])`;

/**
 * The text field a layer starts with, when its first control is one; otherwise `null` (US-QS-15, issue 1104). The actions of
 * a form bar (`data-form-bar`, SG-SHEET-04) are chrome like the close button: they never count, wherever the bar stands (the sheet's bar, or after the last field).
 */
export function leadingTextField(layer: HTMLElement | null): HTMLElement | null {
  const first =
    Array.from(layer?.querySelectorAll<HTMLElement>(CONTROL) ?? []).find(
      (el) => !el.closest("[data-form-bar]"),
    ) ?? null;
  return first?.matches(TEXT_FIELD) ? first : null;
}

/**
 * Focus on open for a layer (US-QS-15, issue 1028): the title takes the focus, so no button inside a layer gets it first
 * (a stray Enter on "Freundschaft beenden" would end a friendship). A text field that comes first keeps the focus, as the
 * wish form starts in its species search (issue 902). Radix would focus the first focusable element otherwise.
 */
export function focusModalTitle(event: Event): void {
  const modal = event.currentTarget as HTMLElement | null;
  if (leadingTextField(modal)) return;
  event.preventDefault();
  const titleId = modal?.getAttribute("aria-labelledby");
  if (titleId) document.getElementById(titleId)?.focus();
}

export type ResponsiveModalProps = {
  /** Required: the accessible name of the modal (DS-40). */
  title: string;
  description?: string;
  /** Accessible name of the dialog's close button (German, supplied by the caller). */
  closeLabel?: string;
  /** Element that opens the modal (rendered as is, `asChild`). Omit for a controlled modal. */
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Focus on open; Radix's default (the first focusable element) unless given, e.g. `focusModalTitle` for a layer. */
  onOpenAutoFocus?: (event: Event) => void;
  /** Runs once the modal has closed and left the page, after its exit animation (US-QS-15, F7); a layer keeps its body until then. */
  onExited?: () => void;
  /** How often the parent refused a close (US-QS-32): a sheet snaps back to its place at each one; a dialog does not move. */
  closeRefusals?: number;
  /** A sheet opens at half height at least, also with a short content (US-QS-15, owner decision 2026-11-22, issue 2424); a dialog is not affected. */
  halfHeight?: boolean;
  /**
   * The element the focus returns to when the modal closes, for a controlled modal without a trigger (US-QS-08). When it
   * has left the page, the focus goes to the start of the view (`returnFocus`). Omit it to keep the default of each container.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null> | undefined;
  children: React.ReactNode;
};

/**
 * The children render once into a stable node that moves into whichever container is open, so their state survives a
 * viewport change across `md` (DS-23). `body` is the container's slot; `host` is what the children render into.
 * `onExited` runs once a closed modal has left the page: when its container unmounts after the exit animation (a sheet
 * slides out, a dialog has none), or at once when no container is mounted (US-QS-15, F7).
 */
function useHost(open: boolean, onExited: (() => void) | undefined) {
  const [host] = React.useState(() => {
    const node = document.createElement("div");
    node.className = "contents";
    return node;
  });
  const mounted = React.useRef<HTMLDivElement | null>(null);
  const exited = React.useRef(onExited);
  React.useLayoutEffect(() => {
    exited.current = onExited;
  });
  const slot = React.useCallback(
    (el: HTMLDivElement | null) => {
      el?.appendChild(host);
      mounted.current = el;
      if (!el) exited.current?.();
    },
    [host],
  );
  React.useEffect(() => {
    if (!open && !mounted.current) exited.current?.();
  }, [open]);
  return { host, body: <div ref={slot} className="contents" /> };
}

type Hosted = { host: HTMLElement; barHost: React.ContextType<typeof FormBarHostContext> };

/** The children go through a portal, so the sheet and the dialog provide nothing to them: the form bar host (US-QS-32) and the layer scope (SG-LIST-01) come from here. */
function HostedChildren(props: Hosted & { children: React.ReactNode }) {
  return createPortal(
    <FormBarHostContext.Provider value={props.barHost}>
      <LayerScope.Provider value>{props.children}</LayerScope.Provider>
    </FormBarHostContext.Provider>,
    props.host,
  );
}

/**
 * Modal for content a phone user fills in (US-QS-07, DS-23): bottom sheet below `md`, centered dialog from `md`.
 * The children are rendered once into a stable host node that moves between the two containers,
 * so their state survives a viewport change across `md`.
 */
export function ResponsiveModal({
  title,
  description,
  closeLabel,
  trigger,
  open: openProp,
  onOpenChange,
  onOpenAutoFocus,
  onExited,
  closeRefusals,
  halfHeight,
  returnFocusTo,
  children,
}: ResponsiveModalProps) {
  const isMd = useIsMd();
  const { open, setOpen, opened } = useOpenState(openProp, onOpenChange);
  usePreloadDialog(isMd);
  const { host, body } = useHost(open, onExited);
  // What the forms inside learn about the bar: the sheet's slot below `md`, the bar pinned at the bottom of the dialog from `md` (US-QS-32, d-115).
  const { barHost, sheetBar } = useModalBarHost(isMd, () => setOpen(false));
  // A sheet returns the focus to the element given, as the dialog does (US-QS-08); Vaul would use what had the focus at open.
  const sheetCloseFocus = returnFocusOnClose(returnFocusTo);
  return (
    <>
      {isMd ? (
        <DialogPart
          title={title}
          description={description}
          closeLabel={closeLabel}
          trigger={trigger}
          open={open}
          opened={opened}
          onOpenChange={setOpen}
          onOpenAutoFocus={onOpenAutoFocus}
          returnFocusTo={returnFocusTo}
          onBarSlot={sheetBar.setSlot}
          body={body}
        />
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
          <SheetContent
            title={title}
            {...(description ? { description } : {})}
            {...(closeLabel !== undefined ? { closeLabel } : {})}
            {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
            {...(sheetCloseFocus ? { onCloseAutoFocus: sheetCloseFocus } : {})}
            {...(closeRefusals !== undefined ? { closeRefusals } : {})}
            {...(halfHeight ? { halfHeight } : {})}
            onBarSlot={sheetBar.setSlot}
            barActive={sheetBar.active}
          >
            {body}
          </SheetContent>
        </Sheet>
      )}
      <HostedChildren host={host} barHost={barHost}>
        {children}
      </HostedChildren>
    </>
  );
}
