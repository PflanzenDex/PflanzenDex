import * as React from "react";
import { Drawer } from "vaul";
import { cn, mergeRefs } from "@/shared/lib/utils";
import { StatusBarDim } from "@/shared/platform/device/status-bar/status-bar";
import { LayerScope } from "../../layer-scope/layer-scope";
import { focusOnOpen } from "./open-focus";
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
};

/** Vaul's timing of a reset (`resetDrawer` of Vaul 1.1): half a second on the sheet and on its overlay. */
const SNAP = "0.5s cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Brings the sheet and its overlay back to their place. Vaul moves them with the drag and only resets them when it
 * releases a sheet that stays open; a close that the parent refused (typed input unsaved, US-QS-32) leaves them where the
 * finger put them, so the sheet does it here.
 */
function snapBack(sheet: HTMLElement | null, overlay: HTMLElement | null): void {
  if (sheet) {
    sheet.style.transition = `transform ${SNAP}`;
    sheet.style.transform = "translate3d(0, 0, 0)";
  }
  if (overlay) {
    overlay.style.transition = `opacity ${SNAP}`;
    overlay.style.opacity = "1";
  }
}

/** Vaul's focus on close: the caller's handler first, then the opener when it is still on the page. */
function closeFocus(
  opener: { current: HTMLElement | null },
  next: ((e: Event) => void) | undefined,
) {
  return (e: Event) => {
    next?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  };
}

/**
 * Vaul's focus on open: the opener is remembered, then the caller's handler runs, then the focus goes where Radix puts it
 * when the handler left it (`focusOnOpen`, which passes the close button over).
 */
function openFocus(
  opener: { current: HTMLElement | null },
  close: { current: HTMLElement | null },
  next: ((e: Event) => void) | undefined,
) {
  return (e: Event) => {
    opener.current = document.activeElement as HTMLElement | null;
    next?.(e);
    if (!e.defaultPrevented) focusOnOpen(e, close.current);
  };
}

/**
 * Snaps the sheet back at each close the parent refused (US-QS-32); a sheet that mounts after one does not move. Gives the
 * refs of the sheet and of its overlay.
 */
function useSnapBack(closeRefusals: number, ref: React.ForwardedRef<HTMLDivElement>) {
  const sheet = React.useRef<HTMLDivElement | null>(null);
  const overlay = React.useRef<HTMLDivElement | null>(null);
  // One callback per forwarded ref: a new one each render would make Vaul detach and attach the sheet on every render.
  const content = React.useMemo(() => mergeRefs(ref, sheet), [ref]);
  const seen = React.useRef(closeRefusals);
  React.useEffect(() => {
    if (closeRefusals === seen.current) return;
    seen.current = closeRefusals;
    snapBack(sheet.current, overlay.current);
  }, [closeRefusals]);
  return { content, overlay };
}

/**
 * The Vaul part of the bottom sheet (US-QS-07, DS-23, DS-40, DS-08): drag handle, safe-area padding, max height 90dvh.
 * `autoFocus` is required: Vaul 1.1 cancels Radix's focus-on-open by default, which left the focus on the trigger
 * and Tab walking the page behind the sheet (US-QS-14, issue 604, WCAG 2.4.3).
 * Only `sheet.tsx` imports this file, and only through a dynamic import, so Vaul stays out of the initial JS.
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
      ...props
    },
    ref,
  ) => {
    // Radix returns focus through its Dialog.Trigger, which the sheet does not use, so remember the opener here.
    const opener = React.useRef<HTMLElement | null>(null);
    const close = React.useRef<HTMLButtonElement | null>(null);
    const { content, overlay } = useSnapBack(closeRefusals, ref);
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
        <Drawer.Portal>
          <Drawer.Overlay ref={overlay} className="fixed inset-0 z-50 bg-scrim">
            <StatusBarDim />
          </Drawer.Overlay>
          <Drawer.Content
            ref={content}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-card bg-card shadow-elevation-2 pb-[env(safe-area-inset-bottom)] text-foreground",
              // A list that pages by free height (`data-page-fit`) gets the full height to fill (issue 1156).
              "has-[[data-page-fit]]:h-[90dvh]",
              className,
            )}
            {...props}
            onOpenAutoFocus={openFocus(opener, close, onOpenAutoFocus)}
            onCloseAutoFocus={closeFocus(opener, onCloseAutoFocus)}
          >
            {/* The grabber is drawn in the input boundary token: 4.8:1 on the card in light, 4.4:1 in dark (WCAG 1.4.11). */}
            <div
              aria-hidden="true"
              className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-input"
            />
            <TitleRow
              title={title}
              closeLabel={closeLabel}
              close={close}
              onClose={() => onOpenChange(false)}
            />
            {description ? (
              <Drawer.Description className="px-4 text-sm text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : null}
            <div className="overflow-y-auto p-4 has-[[data-page-fit]]:flex has-[[data-page-fit]]:min-h-0 has-[[data-page-fit]]:flex-1 has-[[data-page-fit]]:flex-col">
              <LayerScope.Provider value>{children}</LayerScope.Provider>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  },
);
SheetPanel.displayName = "SheetPanel";

export default SheetPanel;
