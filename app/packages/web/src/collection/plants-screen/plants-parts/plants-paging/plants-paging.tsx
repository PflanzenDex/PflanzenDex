import { useIsLg } from "@/shared/platform/visibility/use-lg-breakpoint";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import type { EntriesPaging } from "@/shared/patterns/responsive/entry-list/paging/paging";
import { texts } from "@/shared/lib/text-rules/texts";
import type { CardPages } from "../../../specimens/cards/use-card-pages";
import { PlantTileSkeleton } from "../../rows/plant-tile/plant-tile";
import table from "../../plant-layers/plant-layers.de.json";

const t = texts(table);

/**
 * Plants asked for past the loaded ones in one step, without a layout (starting values, assumption): 6 below 768 px (one
 * column), 12 from 768 px (two columns), 16 from 1024 px. The server part decides how many arrive.
 */
export function usePageSize(): number {
  const md = useIsMd();
  const lg = useIsLg();
  return lg ? 16 : md ? 12 : 6;
}

/** The server paging of a list of plants for the list (FR-BES-23): total, loading state, failure, tile skeleton (F-0124). */
export function pagingOf(list: CardPages, fallbackTotal: number): EntriesPaging {
  return {
    total: list.total ?? fallbackTotal,
    loading: list.status === "pending" || list.loadingMore,
    // An error without a text still counts as a failure: the list would ask for the part again and again.
    ...(list.error === undefined ? {} : { failure: list.error.text || t("list.failed") }),
    onMore: list.loadMore,
    onRetry: list.retry,
    loadingText: t("list.loading"),
    retryText: t("list.retry"),
    placeholder: <PlantTileSkeleton />,
  };
}
