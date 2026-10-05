import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

export type PageSkeletonProps = {
  /** Loading text for assistive technology (German). */
  label?: string;
};

/** Suspense fallback of route-level pages (US-QS-07, DS-55, DS-56): a heading block and three card blocks, no numbers (P-08). */
export function PageSkeleton({ label = "Lädt…" }: PageSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4 p-4">
      <Skeleton className="h-8 w-2/3 max-w-xs" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </SkeletonGroup>
  );
}
