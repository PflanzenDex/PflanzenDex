import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The function of a locked page while it loads: the title, the purpose and the unlock button (US-ONB-05, DS-52, DS-53); shows after the delay (DS-57). */
export function UnlockSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-12 w-48" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
