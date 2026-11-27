import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { ObjectRowsSkeleton } from "@/shared/lists/object-row-skeleton/object-row-skeleton";

/**
 * Placeholder with the layout of the species page on a phone: the row of search and "Filter", then a page of object rows in
 * one group, the shape of the loaded page (DS-52, DS-53, US-QS-32 FX-35 step 5), so the cold load does not shift.
 */
export function PokedexPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-end gap-2">
        <Skeleton className="h-11 min-w-0 flex-1" />
        <Skeleton className="h-11 w-24 shrink-0 rounded-full" />
      </div>
      <ObjectRowsSkeleton rows={4} />
    </SkeletonGroup>
  );
}

/** The progress of the layer: the bar and three lines of text (US-POK, DS-52, DS-53); shows after the delay (DS-57). */
export function ProgressSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-3 w-full rounded-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-2/3" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}

/** The milestones of the layer as three rows (US-POK, DS-52, DS-53); shows after the delay (DS-57). */
export function MilestonesSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-control" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
