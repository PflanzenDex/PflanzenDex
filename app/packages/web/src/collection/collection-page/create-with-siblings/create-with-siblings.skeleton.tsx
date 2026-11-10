import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The create form of a species while its other plants are read: the fields and the button (US-BES-03, DS-52, DS-53); shows after the delay (DS-57). */
export function CreateFormSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
        <Skeleton className="h-12 w-40" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
