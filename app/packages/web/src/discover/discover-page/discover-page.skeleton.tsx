import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/**
 * Placeholder with the layout of the suggestion card on a phone: image, name, text and three buttons (US-ENT-01, DS-52,
 * DS-53). It shows after the delay (DS-57), so a fast deck shows nothing.
 */
export function DiscoverPageSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
