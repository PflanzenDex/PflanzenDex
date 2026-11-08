import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The leaf log: the count line and three leaves, each a row (US-WAC-07, DS-52, DS-53); shows after the delay (DS-57). */
export function LeafLogSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="grid gap-3">
        <Skeleton className="h-5 w-1/2" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-control" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
