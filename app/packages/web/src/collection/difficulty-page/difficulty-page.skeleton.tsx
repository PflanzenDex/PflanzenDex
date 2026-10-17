import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the species comparison on a phone: title, intro and three row cards (DS-52, DS-53). */
export function DifficultyPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-10 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 w-full rounded-lg" />
      ))}
    </SkeletonGroup>
  );
}
