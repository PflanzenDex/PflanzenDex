import * as React from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

const Sheet = Drawer.Root;
const SheetTrigger = Drawer.Trigger;

export type SheetContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof Drawer.Content>,
  "title"
> & {
  /** Required: the accessible name of the sheet (DS-40). */
  title: string;
  /** Optional description linked to the sheet. */
  description?: string;
};

/** Bottom sheet (US-QS-07, DS-23, DS-40): Vaul drag handle, safe-area padding, max height 90dvh. */
const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, title, description, children, ...props }, ref) => (
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
      <Drawer.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-xl border border-border bg-background pb-[env(safe-area-inset-bottom)] text-foreground",
          className,
        )}
        {...props}
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
  ),
);
SheetContent.displayName = "SheetContent";

export { Sheet, SheetContent, SheetTrigger };
