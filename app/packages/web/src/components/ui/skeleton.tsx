import * as React from "react";
import { cn } from "@/lib/utils";

/** One placeholder block (US-QS-07, DS-52, DS-56). Decorative: hidden from assistive technology; give it the size of the content it mirrors. Never put a number in it (P-08). */
const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";

export type SkeletonGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Text read out while loading, supplied by the caller (German "Lädt…"). */
  label: string;
};

/** Container of skeleton blocks: the single `role="status"` with the visually hidden loading text (DS-56). */
const SkeletonGroup = React.forwardRef<HTMLDivElement, SkeletonGroupProps>(
  ({ className, label, children, ...props }, ref) => (
    <div ref={ref} role="status" className={cn(className)} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  ),
);
SkeletonGroup.displayName = "SkeletonGroup";

export { Skeleton, SkeletonGroup };
