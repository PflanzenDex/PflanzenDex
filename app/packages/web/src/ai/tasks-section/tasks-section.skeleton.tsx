import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/** The tasks to the AI client as two cards (US-KI-08, DS-52, DS-53); shows after the delay (DS-57). */
export function TasksSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}

/** The form of a new task: two fields with their labels and the button (US-KI-08, DS-52); shows after the delay (DS-57). */
export function NewTaskSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        {[0, 1].map((i) => (
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
