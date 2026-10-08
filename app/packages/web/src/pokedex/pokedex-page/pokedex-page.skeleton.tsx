import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the page on a phone: count, search field, filter buttons, sort field and two cards (DS-52, DS-53). */
export function PokedexPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-20 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-24 rounded-full" />
      </div>
      <Skeleton className="h-11 w-full" />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </ul>
    </SkeletonGroup>
  );
}
