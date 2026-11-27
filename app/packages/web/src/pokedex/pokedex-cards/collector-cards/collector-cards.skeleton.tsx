import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";

/** The shelf of collector cards of the layer: one card and the next one peeking in (US-POK, US-QS-15, DS-52, DS-53); shows after the delay (DS-57). */
export function CollectorCardsSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-h-0 min-w-0 gap-3 overflow-hidden">
        <Skeleton className="h-72 w-[calc(100%-3rem)] shrink-0 rounded-card" />
        <Skeleton className="h-72 w-[calc(100%-3rem)] shrink-0 rounded-card" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
