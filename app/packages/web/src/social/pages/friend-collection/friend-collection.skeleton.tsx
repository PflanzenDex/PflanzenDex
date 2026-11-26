import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";

/**
 * Placeholder with the layout of the page on a phone: the filter and two cards (DS-52, DS-53). The route's fallback of a
 * friend's collection draws it under the heading (`FriendCollectionRouteSkeleton`, in the app's route fallbacks, issue 2243).
 */
export function FriendCollectionSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </SkeletonGroup>
  );
}
