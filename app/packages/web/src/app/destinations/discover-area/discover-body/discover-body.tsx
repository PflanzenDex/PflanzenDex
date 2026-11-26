import { SpeciesPageSkeleton } from "@/catalog";
import { DiscoverPageSkeleton } from "@/discover";
import { texts } from "@/shared/lib/text-rules/texts";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton } from "@/shared/ui/skeleton";
import type { DiscoverView } from "../discover-mode";
import table from "../discover-area.de.json";

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
 * The body of "Entdecken" below its title (issue 2243): the switch and the mode's body, after the delay (DS-57). The route's
 * fallback and the start frame draw this body; it imports no header and no link, so the start chunk can carry it. The two
 * skeletons are imported by their module paths, not through the barrels of `@/catalog` and `@/discover`: the barrel of
 * `@/social` measured about 10 kB of initial JS when the start frame imported it (issue 2243).
 */
export function DiscoverBody({ view }: { view: DiscoverView }) {
  return (
    <DelayedSkeleton>
      <div className="flex min-w-0 flex-col gap-3">
        <Skeleton className="h-11 w-full rounded-pill" />
        <DiscoverModeSkeleton view={view} />
      </div>
    </DelayedSkeleton>
  );
}
