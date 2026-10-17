import * as React from "react";
import { cn } from "@/lib/utils";

export type StepIndicatorProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  /** 1-based number of the current step; clamped to 1..total. */
  current: number;
  total: number;
  /** Name of the current step, shown after the count ("Schritt 2 von 4: Standort", 3.3.7). */
  name?: string;
};

/**
 * "Schritt n von m" for flows with more than one step (US-QS-07, US-QS-09). The text carries the meaning; the segments
 * only repeat it visually and are hidden from assistive technology, so the position is read once.
 */
const StepIndicator = React.forwardRef<HTMLDivElement, StepIndicatorProps>(
  ({ className, current, total, name, ...props }, ref) => {
    const count = Math.max(1, Math.floor(total));
    const step = Math.min(Math.max(Math.floor(current), 1), count);
    return (
      <div ref={ref} className={cn("grid gap-2", className)} {...props}>
        <p className="text-sm font-semibold">
          {`Schritt ${step} von ${count}`}
          {name ? `: ${name}` : ""}
        </p>
        <div aria-hidden="true" className="flex gap-1">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              data-done={i < step ? "" : undefined}
              className={cn(
                "h-2 flex-1 rounded-pill border border-border bg-secondary forced-colors:border-[CanvasText]",
                i < step && "border-primary bg-primary forced-colors:bg-[Highlight]",
              )}
            />
          ))}
        </div>
      </div>
    );
  },
);
StepIndicator.displayName = "StepIndicator";

export { StepIndicator };
