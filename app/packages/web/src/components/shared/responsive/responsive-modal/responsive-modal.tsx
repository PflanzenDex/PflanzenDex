import * as React from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlays/dialog/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/overlays/sheet/sheet";
import { useIsMd } from "@/lib/use-breakpoint";

const TEXT_FIELD =
  "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled])";
const CONTROL = `${TEXT_FIELD}, button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])`;

/**
 * Focus on open for a layer (US-QS-15, issue 1028): the title takes the focus, so no button inside a layer gets it first
 * (a stray Enter on "Freundschaft beenden" would end a friendship). A text field that comes first keeps the focus, as the
 * wish form starts in its species search (issue 902). Radix would focus the first focusable element otherwise.
 */
export function focusModalTitle(event: Event): void {
  const modal = event.currentTarget as HTMLElement | null;
  if (modal?.querySelector<HTMLElement>(CONTROL)?.matches(TEXT_FIELD)) return;
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
  children: React.ReactNode;
};

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
  children,
}: ResponsiveModalProps) {
  const isMd = useIsMd();
  const [inner, setInner] = React.useState(false);
  const open = openProp ?? inner;
  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };

  const [host] = React.useState(() => {
    const node = document.createElement("div");
    node.className = "contents";
    return node;
  });
  const slot = React.useCallback(
    (el: HTMLDivElement | null) => {
      el?.appendChild(host);
    },
    [host],
  );
  const copy = description ? { description } : {};
  const body = <div ref={slot} className="contents" />;

  return (
    <>
      {isMd ? (
        <Dialog open={open} onOpenChange={setOpen}>
          {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
          <DialogContent
            title={title}
            {...copy}
            {...(closeLabel ? { closeLabel } : {})}
            {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
          >
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
          <SheetContent title={title} {...copy} {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}>
            {body}
          </SheetContent>
        </Sheet>
      )}
      {createPortal(children, host)}
    </>
  );
}
