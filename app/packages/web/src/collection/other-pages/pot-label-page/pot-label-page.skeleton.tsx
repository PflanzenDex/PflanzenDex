import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The plant of a pot label while it loads: the heading area, the photo, the name and the actions (US-BES-17, DS-52, DS-53); shows after the delay (DS-57). */
export function PotLabelSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-32" />
        </div>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
