import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the measure page on a phone: the three header lines, the form and the course (DS-52, DS-53). */
export function MeasurePageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 max-w-xl flex-col gap-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-16 w-full" />
    </SkeletonGroup>
  );
}
