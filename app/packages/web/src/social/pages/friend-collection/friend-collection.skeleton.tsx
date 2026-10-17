import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the page on a phone: the filter and two cards (DS-52, DS-53). */
export function FriendCollectionSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </SkeletonGroup>
  );
}
