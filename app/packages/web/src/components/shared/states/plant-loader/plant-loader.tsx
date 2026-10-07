import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/** PlantLoader sizes (US-QS-07, DS-34). The drawing scales with the box. */
const plantLoaderVariants = cva(
  "inline-flex shrink-0 items-center justify-center text-primary [&_svg]:size-full",
  {
    variants: {
      size: { sm: "size-6", md: "size-10", lg: "size-16" },
    },
    defaultVariants: { size: "md" },
  },
);

export type PlantLoaderProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> &
  VariantProps<typeof plantLoaderVariants> & {
    /** Text read out while loading, supplied by the caller (German "Lädt…"). */
    label?: string;
    /** Draw only: no status, for places that already carry one (a skeleton group). */
    decorative?: boolean;
  };

/**
 * Animated sprout for route and request loading, next to Skeleton (US-QS-07, DS-56). It grows and sways with the
 * motion tokens; under reduced motion it stands still. Announced once as `role="status"`, or hidden when `decorative`.
 */
const PlantLoader = React.forwardRef<HTMLSpanElement, PlantLoaderProps>(
  ({ className, size, label = "Lädt…", decorative = false, ...props }, ref) => (
    <span
      ref={ref}
      {...(decorative ? { "aria-hidden": true } : { role: "status" })}
      className={cn(plantLoaderVariants({ size }), className)}
      {...props}
    >
      {decorative ? null : <span className="sr-only">{label}</span>}
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
        <path d="M6 28h20" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
        <g className="origin-bottom animate-plant-sway [transform-box:fill-box] motion-reduce:animate-none">
          <g className="origin-bottom animate-plant-grow [transform-box:fill-box] motion-reduce:animate-none">
            <path d="M16 28V13" className="stroke-current" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 17C16 11 11 8 5 9c0 6 4 9 11 8Z" className="fill-current" />
            <path d="M16 13c0-5 4-8 11-7 0 6-4 9-11 7Z" className="fill-current" />
          </g>
        </g>
      </svg>
    </span>
  ),
);
PlantLoader.displayName = "PlantLoader";

export { PlantLoader, plantLoaderVariants };
