import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The registered browsers as two rows, each with its way to remove it (US-MON-08, DS-52, DS-53); shows after the delay (DS-57). */
export function SubscriptionsSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-2">
        <Skeleton className="h-16 w-full rounded-control" />
        <Skeleton className="h-16 w-full rounded-control" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
