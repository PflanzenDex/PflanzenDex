import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Badge looks (US-QS-07, DS-34, DS-35). Not interactive; the text carries the meaning, colour only supports it (DS-38).
 * States are neutral (SG-COLOR-01): `default` is the group fill with text in `foreground`, and an ended state is `outline`.
 * `warning` only for the SG-COLOR-04 cases: an overdue or due treatment, "Abweichung", "Vergeilt", "Defekt". `destructive`
 * is for errors only. No variant uses the primary fill.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-label font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-foreground",
        outline: "border-border bg-card text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        warning: "border-warning-border bg-warning text-warning-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
