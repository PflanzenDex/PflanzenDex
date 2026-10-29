import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the plants on a phone: the insight row and a page of tiles (DS-52, DS-53, US-QS-19). */
export function CollectionPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
    </SkeletonGroup>
  );
}
