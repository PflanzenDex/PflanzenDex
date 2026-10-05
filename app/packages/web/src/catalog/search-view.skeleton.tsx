import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/** Placeholder with the layout of the hit list on a phone: three rows of name, German name and badge (DS-52, DS-53). */
export function SearchResultsSkeleton() {
  return (
    <SkeletonGroup label="Suche läuft …" className="grid list-none gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid min-h-16 gap-1 rounded-xl border border-border p-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
