import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the review list on a phone: summary and two entries with facts and buttons (DS-52, DS-53). */
export function ReviewPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-6 w-3/4" />
      {[0, 1].map((i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-border p-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-11 w-full sm:w-40" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
