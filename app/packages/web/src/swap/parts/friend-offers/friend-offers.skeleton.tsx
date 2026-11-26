import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";

/** The offers of friends as two cards (US-SOZ-08, DS-52, DS-53); shows after the delay (DS-57). */
export function FriendOffersSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
