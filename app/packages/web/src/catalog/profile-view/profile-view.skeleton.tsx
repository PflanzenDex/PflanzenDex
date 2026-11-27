import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton, SkeletonGroup } from "@/shared/ui/skeleton";

/**
 * Placeholder with the layout of the species profile (DS-52, DS-53), as `SpeciesProfile` lays it out: the way back beside
 * the name, the photo and the badge, the action bar with its buttons, then the facts in a tab strip with their rows. The
 * boxes keep the heights of the loaded parts (44 px way back, 32 px title, 48 px photo, 48 px buttons, 52 px tab strip).
 * It shows after the delay of DS-57 (issue 1726): a profile that arrives sooner shows no skeleton and no status. The route's
 * fallback of the profile (`ProfileRouteSkeleton`) is in the app's route fallbacks (issue 2243).
 */
export function ProfileSkeleton() {
  return (
    <DelayedSkeleton>
      <SkeletonGroup label="Art wird geladen …" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span aria-hidden="true" className="block size-11 shrink-0" />
            <Skeleton className="h-8 max-w-full grow basis-[230px]" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-xl" />
            <Skeleton className="h-6 w-28 self-start rounded-pill" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-12 w-full sm:w-52" />
          <Skeleton className="h-12 w-full sm:w-52" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-[52px] w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="grid gap-1 border-b border-border py-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
      </SkeletonGroup>
    </DelayedSkeleton>
  );
}
