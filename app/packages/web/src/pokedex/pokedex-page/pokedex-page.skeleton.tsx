import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the page on a phone: count, search field, filter buttons, sort field and two cards (DS-52, DS-53). */
export function PokedexPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-20 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
      </div>
      <Skeleton className="h-11 w-full" />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </ul>
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
