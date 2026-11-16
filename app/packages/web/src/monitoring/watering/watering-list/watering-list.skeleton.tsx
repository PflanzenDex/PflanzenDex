import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/**
 * Placeholder with the layout of the watering list on a phone: three rows (checkbox with name and interval, the
 * "Gegossen" button), then the button for several plants (US-MON-05, DS-52, DS-53). It shows after the delay (DS-57).
 */
export function WateringListSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="size-5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
        <Skeleton className="h-11 w-64" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
