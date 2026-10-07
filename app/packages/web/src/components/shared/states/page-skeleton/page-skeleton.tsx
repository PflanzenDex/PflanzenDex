import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export type PageSkeletonProps = {
  /** Loading text for assistive technology (German). */
  label?: string;
};

/** Suspense fallback of route-level pages (US-QS-07, DS-55, DS-56): a heading block and three card blocks, no numbers (P-08). */
export function PageSkeleton({ label = "Lädt…" }: PageSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4 p-4 py-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-tile" />
        <Skeleton className="h-8 w-2/3 max-w-xs" />
      </div>
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
    </SkeletonGroup>
  );
}
