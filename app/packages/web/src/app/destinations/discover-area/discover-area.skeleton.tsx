import { SpeciesPageSkeleton } from "@/catalog";
import { DiscoverPageSkeleton } from "@/discover";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/display/skeleton/delayed-skeleton/delayed-skeleton";
import { Skeleton } from "@/shared/ui/display/skeleton/skeleton";
import type { DiscoverView } from "./discover-view";
import table from "./discover-area.de.json";

const t = texts(table);

/**
 * The body of the destination "Entdecken" while its mode loads (US-QS-14, DS-52): the suggestion card, or the catalog's
 * search with its hits. It carries the one loading status of the mode (DS-56) and shows after the delay (DS-57).
 */
export function DiscoverModeSkeleton({ view }: { view: DiscoverView }) {
  return view === "catalog" ? (
    <SpeciesPageSkeleton label={t("catalog.loading")} />
  ) : (
    <DiscoverPageSkeleton label={t("suggestions.loading")} />
  );
}

/**
 * The route's fallback of "Entdecken" until its chunk is there (US-QS-14, issue 1697): the title stands at once as the
 * one h1 (its focus waits for the page's own heading, RouteFocus), the switch and the mode's body wait for the delay.
 */
export function DiscoverRouteSkeleton({ view }: { view: DiscoverView }) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-180 flex-col gap-4">
      <h1 data-route-fallback="" className="text-2xl font-semibold">
        {t("page.title")}
      </h1>
      <DelayedSkeleton>
        <div className="flex min-w-0 flex-col gap-3">
          <Skeleton className="h-11 w-full rounded-pill" />
          <DiscoverModeSkeleton view={view} />
        </div>
      </DelayedSkeleton>
    </div>
  );
}
