import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the operator page on a phone: the numbers, the cost form and the mode (DS-52, DS-53). */
export function OperatorPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 max-w-xl flex-col gap-4">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}
