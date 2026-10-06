import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { cn } from "@/lib/utils";

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
};

/** Modal dialog (US-QS-07, DS-23, DS-40): focus trap, Esc closes, focus returns to the trigger (Radix). */
const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, title, description, closeLabel = "Schließen", children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-background p-6 text-foreground shadow-lg",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="text-lg font-semibold leading-none">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute right-2 top-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md forced-colors:border forced-colors:border-[color:ButtonText] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <span aria-hidden="true">×</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";

export { Dialog, DialogContent, DialogTrigger };
