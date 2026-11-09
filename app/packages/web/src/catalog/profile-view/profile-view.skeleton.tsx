import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import { PROFILE_CARD } from "./profile-card";

/**
 * Placeholder with the layout of the species profile (DS-52, DS-53), as `SpeciesProfile` lays it out: the way back beside
 * the name, the photo and the badge, the action bar with its buttons, then the facts in a tab strip with their rows. The
 * boxes keep the heights of the loaded parts (44 px way back, 32 px title, 48 px photo, 48 px buttons, 52 px tab strip).
 * It shows after the delay of DS-57 (issue 1726): a profile that arrives sooner shows no skeleton and no status.
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

/**
 * The route's fallback of the species profile (`/discover/species/:id`) until its chunk is there (issue 1727): the frame
 * and the card the profile is shown in, with the profile's own skeleton inside, so the card does not change size when the
 * page arrives. The card waits for the delay like every skeleton (DS-57), so a fast load draws no empty card. The profile
 * has no heading before its name is known, so the fallback has none either.
 */
export function ProfileRouteSkeleton() {
  return (
    <LayerHost className="min-h-0" data-fit-screen="" data-fit-fill="">
      <DelayedSkeleton>
        <div className={PROFILE_CARD}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <ProfileSkeleton />
          </div>
        </div>
      </DelayedSkeleton>
    </LayerHost>
  );
}
