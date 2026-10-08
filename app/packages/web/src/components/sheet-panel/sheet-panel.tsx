import * as React from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

export type SheetPanelProps = Omit<
  React.ComponentPropsWithoutRef<typeof Drawer.Content>,
  "title"
> & {
  /** Required: the accessible name of the sheet (DS-40). */
  title: string;
  /** Optional description linked to the sheet. */
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

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
      children,
      open,
      onOpenChange,
      onOpenAutoFocus,
      onCloseAutoFocus,
      ...props
    },
    ref,
  ) => {
    // Radix returns focus through its Dialog.Trigger, which the sheet does not use, so remember the opener here.
    const opener = React.useRef<HTMLElement | null>(null);
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
          <Drawer.Content
            ref={ref}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-card bg-card shadow-elevation-2 pb-[env(safe-area-inset-bottom)] text-foreground",
              className,
            )}
            {...props}
            onOpenAutoFocus={(e) => {
              opener.current = document.activeElement as HTMLElement | null;
              onOpenAutoFocus?.(e);
            }}
            onCloseAutoFocus={(e) => {
              onCloseAutoFocus?.(e);
              if (e.defaultPrevented) return;
              e.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
          >
            <div
              aria-hidden="true"
              className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted"
            />
            <Drawer.Title className="px-4 pt-3 text-lg font-semibold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="px-4 text-sm text-muted-foreground">
                {description}
              </Drawer.Description>
            ) : null}
            <div className="overflow-y-auto p-4">{children}</div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  },
);
SheetPanel.displayName = "SheetPanel";

export default SheetPanel;
