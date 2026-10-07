import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the page on a phone: the invite button, the code field, two requests (DS-52, DS-53). */
export function FriendsPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-12 w-full max-w-xs" />
      <Skeleton className="h-11 w-full max-w-xl" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </SkeletonGroup>
  );
}
