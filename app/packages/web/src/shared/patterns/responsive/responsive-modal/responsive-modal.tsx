import * as React from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/overlays/sheet/sheet";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { returnFocusOnClose } from "@/shared/platform/routing/route-focus/view-start";
import { DialogPart, preloadDialog } from "./dialog-part/dialog-part";

const TEXT_FIELD =
  "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])";
const CONTROL = `${TEXT_FIELD}, button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])`;

/** The text field a layer starts with, when its first control is one; otherwise `null` (US-QS-15, issue 1104). */
export function leadingTextField(layer: HTMLElement | null): HTMLElement | null {
  const first = layer?.querySelector<HTMLElement>(CONTROL) ?? null;
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

/** Loads the dialog code while the browser is idle, from `md` up (DS-08, NFR-12). */
function usePreloadDialog(isMd: boolean) {
  React.useEffect(() => {
    if (!isMd) return;
    const id = window.setTimeout(preloadDialog, 1500);
    return () => window.clearTimeout(id);
  }, [isMd]);
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
  returnFocusTo,
  children,
}: ResponsiveModalProps) {
  const isMd = useIsMd();
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };
  const [opened, setOpened] = React.useState(open);
  if (open && !opened) setOpened(true);

  usePreloadDialog(isMd);
  const { host, body } = useHost(open, onExited);
  const copy = description ? { description } : {};
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
          body={body}
        />
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
          <SheetContent
            title={title}
            {...copy}
            {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
            {...(sheetCloseFocus ? { onCloseAutoFocus: sheetCloseFocus } : {})}
          >
            {body}
          </SheetContent>
        </Sheet>
      )}
      {createPortal(children, host)}
    </>
  );
}
