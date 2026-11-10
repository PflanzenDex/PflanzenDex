import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import table from "../../social.de.json";

const t = texts(table);

/** Placeholder with the layout of the page on a phone: the filter and two cards (DS-52, DS-53). */
export function FriendCollectionSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </SkeletonGroup>
  );
}

/**
 * The route's fallback of "Freundes Sammlung" until its chunk is there (issue 1727): the title stands at once as the one
 * h1, named like the page before the friend's name is known (P-08), with its way back and the devices action in one row;
 * the action keeps its box from the first frame, and the blocks wait for the delay (DS-57).
 */
export function FriendCollectionRouteSkeleton() {
  return (
    <LayerHost data-fit-screen="">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className="block size-11 shrink-0" />
          <h1
            data-route-fallback=""
            className="min-w-min flex-1 text-2xl font-semibold [overflow-wrap:normal]"
          >
            {t("friendCollection.title")}
          </h1>
          <div className="h-11 w-24 shrink-0">
            <DelayedSkeleton>
              <Skeleton className="h-full w-full rounded-control" />
            </DelayedSkeleton>
          </div>
        </div>
        <DelayedSkeleton>
          <FriendCollectionSkeleton label={t("friendCollection.loading")} />
        </DelayedSkeleton>
      </section>
    </LayerHost>
  );
}
