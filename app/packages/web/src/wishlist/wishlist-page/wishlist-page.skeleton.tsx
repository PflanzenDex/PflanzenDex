import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";
import { ObjectRowsSkeleton } from "@/shared/lists/object-row-skeleton/object-row-skeleton";

/**
 * Placeholder with the layout of the wishlist on a phone: the row of controls, then a page of wish rows in one group, the
 * shape of the loaded page (DS-52, DS-53, US-QS-32 FX-35 step 5), so the cold load does not shift.
 */
export function WishlistPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-11 w-40 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
      <ObjectRowsSkeleton rows={4} />
    </SkeletonGroup>
  );
}
