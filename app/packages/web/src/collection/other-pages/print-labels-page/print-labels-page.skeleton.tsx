import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";

/** The plants to choose from as three rows of cards (US-BES-17, DS-52, DS-53); shows after the delay (DS-57). */
export function PrintLabelsSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-control" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
