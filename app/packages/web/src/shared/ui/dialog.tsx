import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { StatusBarDim } from "@/shared/platform/device/status-bar/status-bar";
import { PinnedBar } from "@/shared/ui/form-bar.slot";
import { LayerScope } from "./layer-scope";
import { useScrollAccess } from "./dialog.scroll-access";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

export type DialogContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  "title"
> & {
  /** Required: the accessible name of the dialog (DS-40). */
  title: string;
  /** Optional description linked via `aria-describedby`. */
  description?: string;
  /** Accessible name of the close button. The caller supplies the German wording. */
  closeLabel?: string;
  /**
   * Receives the dialog's bar (US-QS-32, owner decision d-115): the element under the scroll region that the form bar of a
   * layer draws its pair into, so the confirming action is always in view. Without it the dialog has no bar.
   */
  onBarSlot?: (element: HTMLElement | null) => void;
};

/**
 * Modal dialog (US-QS-07, DS-23, DS-40): focus trap, Esc closes, focus returns to the trigger (Radix). The title stays, and
 * what the dialog holds is its scroll region when it is longer than the dialog (US-QS-15, DS-61); the bar of a form (`onBarSlot`,
 * US-QS-32) stays below it. The margin and the padding
 * of the region are 1 rem and cancel each other: the region reaches into the padding of the dialog, so the focus ring of a
 * control at its edge is not clipped, and the layer inside it (`LayerBody`, the same 1 rem) adds no sideways scroll.
 */
const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  (
    { className, title, description, closeLabel = "Schließen", onBarSlot, children, ...props },
    ref,
  ) => {
    const [region, setRegion] = React.useState<HTMLElement | null>(null);
    useScrollAccess(region);
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim">
          <StatusBarDim />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card bg-card p-6 text-foreground shadow-elevation-2",
            className,
          )}
          {...props}
        >
          <DialogPrimitive.Title tabIndex={-1} className="text-lg font-semibold leading-none">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div
            ref={setRegion}
            data-scroll-region=""
            className="-m-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <LayerScope.Provider value>{children}</LayerScope.Provider>
          </div>
          {onBarSlot ? <PinnedBar slotRef={onBarSlot} /> : null}
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute right-2 top-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control forced-colors:border forced-colors:border-[color:ButtonText] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
DialogContent.displayName = "DialogContent";

export { Dialog, DialogContent, DialogTrigger };
