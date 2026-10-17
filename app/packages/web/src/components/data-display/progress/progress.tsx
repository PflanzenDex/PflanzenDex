import * as React from "react";
import { cn } from "@/lib/utils";

export type ProgressProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "role"> & {
  /** Accessible name; says what is measured ("Aufgaben erledigt"). */
  "aria-label": string;
  /** Current value between 0 and `max`; out-of-range values are clamped. */
  value: number;
  max?: number;
  /** Spoken instead of the percentage, e.g. "3 von 5 Aufgaben erledigt". */
  valueText?: string;
};

/**
 * Determinate progress bar (US-QS-07, 4.1.2): `role="progressbar"` with name, `aria-valuenow`, min and max. The fill
 * grows with a width transition that ends at once under reduced motion. An unknown value is not drawn as a bar (P-08).
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, valueText, ...props }, ref) => {
    const top = max > 0 ? max : 100;
    const now = Number.isFinite(value) ? Math.min(Math.max(value, 0), top) : 0;
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={top}
        aria-valuenow={now}
        aria-valuetext={valueText}
        className={cn(
          "h-2 w-full overflow-hidden rounded-pill border border-border bg-secondary forced-colors:border-[CanvasText]",
          className,
        )}
        {...props}
      >
        <div
          className="h-full w-(--progress) rounded-pill bg-primary transition-[width] duration-(--motion-base) ease-(--ease-enter) motion-reduce:transition-none forced-colors:bg-[Highlight]"
          style={{ "--progress": `${(now / top) * 100}%` } as React.CSSProperties}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
