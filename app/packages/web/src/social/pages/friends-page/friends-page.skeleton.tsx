import { LayerHost } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton, SkeletonGroup } from "@/shared/ui/display/skeleton/skeleton";
import table from "../../social.de.json";

const t = texts(table);

/**
 * Placeholder with the layout of the screen on a phone: the action, four tiles, two rows (DS-52, DS-53). The rows sit in
 * one column with a gap of 8 px, as the page's rows do (`gap-2`), so the second row does not move when the page arrives.
 */
export function FriendsPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex min-w-0 flex-col gap-4">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </SkeletonGroup>
  );
}

/**
 * The route's fallback of "Freunde" until its chunk is there (issue 1727): the heading stands at once as the one h1 (its
 * focus waits for the page's own heading), and the page's skeleton waits for the delay (DS-57). The frame and the section
 * are those of the page, so the heading and the blocks sit where they do on the page.
 */
export function FriendsRouteSkeleton() {
  return (
    <LayerHost data-fit-screen="">
      <section className="flex min-w-0 flex-col gap-3">
        <h1 data-route-fallback="" className="text-2xl font-semibold">
          {t("page.title")}
        </h1>
        <DelayedSkeleton>
          <FriendsPageSkeleton label={t("page.loading")} />
        </DelayedSkeleton>
      </section>
    </LayerHost>
  );
}
