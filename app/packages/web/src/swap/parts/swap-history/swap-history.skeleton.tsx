import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The swap history as three rows (US-SOZ-09, DS-52, DS-53); shows after the delay (DS-57). */
export function SwapHistorySkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-control" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
