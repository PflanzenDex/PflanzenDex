import { PlantLoader } from "@/shared/patterns/states/plant-loader/plant-loader";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

export type PageSkeletonProps = {
  /** Loading text for assistive technology (German). */
  label?: string;
  /** The destination's own heading, shown where its page puts it while the page loads (issue 1097). */
  heading?: string;
};

/**
 * Suspense fallback of route-level pages (US-QS-07, DS-55, DS-56): a growing sprout beside a heading block and three card
 * blocks, no numbers (P-08). The blocks show only after the delay (US-QS-14, DS-57, issue 1697); the destination's heading
 * is text, not a loader, so it stands at once.
 */
export function PageSkeleton({ label = "Lädt…", heading }: PageSkeletonProps) {
  if (heading)
    return (
      // The h1 sits where the destination's header puts it (top of the content, 28 px semibold), so it does not move
      // when the page arrives; the focus mover skips it and waits for the page's own heading (US-QS-09).
      <div className="mx-auto flex w-full min-w-0 max-w-180 flex-col gap-4">
        <h1 data-route-fallback="" className="text-2xl font-semibold">
          {heading}
        </h1>
        <DelayedSkeleton>
          <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center gap-3">
              <PlantLoader decorative size="lg" />
              <Skeleton className="h-8 w-2/3 max-w-xs" />
            </div>
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </SkeletonGroup>
        </DelayedSkeleton>
      </div>
    );
  return (
    // Capped like the content of a page, so the skeleton of a destination with layers keeps its width (US-QS-15, #1027).
    <DelayedSkeleton>
      <SkeletonGroup
        label={label}
        className="mx-auto flex w-full min-w-0 max-w-180 flex-col gap-4 p-4 py-6"
      >
        <div className="flex items-center gap-3">
          <PlantLoader decorative size="lg" />
          <Skeleton className="h-8 w-2/3 max-w-xs" />
        </div>
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
