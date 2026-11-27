import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";

/** The inbox as three days, each a card with its message (US-MON-01, DS-52, DS-53); shows after the delay (DS-57). */
export function InboxSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-card" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
