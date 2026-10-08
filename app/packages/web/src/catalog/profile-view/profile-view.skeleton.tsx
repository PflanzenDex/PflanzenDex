import { Skeleton, SkeletonGroup } from "@/components/ui/display/skeleton/skeleton";

/** Placeholder with the layout of the species profile on a phone: back button, title, badge, rows (DS-52, DS-53). */
export function ProfileSkeleton() {
  return (
    <SkeletonGroup label="Art wird geladen …" className="flex min-w-0 flex-col gap-3">
      <Skeleton className="h-11 w-44" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-6 w-28" />
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="grid gap-1 border-b border-border py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-12 w-full sm:w-44" />
    </SkeletonGroup>
  );
}
