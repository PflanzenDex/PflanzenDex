import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";

/**
 * Placeholder with the layout of the species catalog on a phone: the search field and three hit rows of name, German
 * name and badge (US-BES-01, DS-52, DS-53). It shows after the delay (DS-57).
 */
export function SpeciesPageSkeleton({ label }: { label: string }) {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-control" />
        <div className="grid list-none gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid min-h-16 gap-1 rounded-xl border border-border p-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
