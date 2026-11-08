import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The list of the functions while the unlocks load: four rows of a function each (US-ONB-06, DS-52, DS-53); shows after the delay (DS-57). */
export function FunctionOverviewSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-control" />
        ))}
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
