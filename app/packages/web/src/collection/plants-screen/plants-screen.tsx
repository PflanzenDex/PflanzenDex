import type { SpecimenCard, SpecimenSummary } from "@pflanzendex/core";
import { Plus } from "lucide-react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import {
  PagedGroups,
  type PagedGroup,
} from "@/shared/patterns/responsive/paged-groups/paged-groups";
import { usePart } from "@/shared/patterns/responsive/paged-groups/group-choices/group-choices";
import { Pager, type PagerPaging } from "@/shared/patterns/responsive/pager/pager";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  groupTitle,
  locationChoices,
  UNPLACED_KEY,
} from "./rows/location-groups/group-by-location";
import { useIsLg, useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { TITLE } from "../specimens/cards/parts/parts";
import { useCardPages, type CardPages } from "../specimens/cards/use-card-pages";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { PlantTile } from "./rows/plant-tile/plant-tile";
import { PlantLayers } from "./plant-layers/plant-layers";
import { ARCHIVE_LAYER, type LayerProps } from "./plant-layers/layer-ids";
import { ZoneInsightRow } from "./rows/zone-insight/zone-insight";
import table from "./plant-layers/plant-layers.de.json";

const t = texts(table);

/**
 * Tiles per page without a layout (starting values, assumption): 2 columns below 768 px, 3 from 768 px, 4 from 1024 px.
 * With a layout the page takes the free height of the region instead (US-QS-19, issue 1029).
 */
export function usePageSize(): number {
  const md = useIsMd();
  const lg = useIsLg();
  return lg ? 16 : md ? 12 : 6;
}

type Props = LayerProps & {
  /** Adds a plant: the app opens the quick flow (US-ONB-01), otherwise the species catalog. */
  onSpeciesChoose: () => void;
  /** Shown below the title of a destination: the heading is then a screen reader section name. */
  embedded?: boolean;
  /** Groups the plants by location and zone; the group is chosen from a row (US-QS-19). */
  groupBy?: "location";
  /** The plants as the server pages them (FR-BES-23): `cards` of the layer props are the loaded ones of this list. */
  plants: CardPages;
  /** The counts over all plants (US-BES-06): the empty state, the total and the groups come from them. */
  summary: SpecimenSummary;
};

// Two tiles per row from a 360 px phone at normal text, one per row at a larger text size (issue 1019). 8.75 rem lets
// two columns fit the 294 px of the list at 360 px, so a page holds 6 tiles (owner decision 2026-11-01, issue 1108);
// a column is never wider than the list, so at a larger text size a tile stays inside its card (issue 1113).
const TILES =
  "grid grid-cols-[repeat(auto-fill,minmax(min(8.75rem,100%),1fr))] gap-2 md:grid-cols-3 lg:grid-cols-4";

/** The server paging of a list of plants for the Pager (FR-BES-23): the total, the loading state and a failure's text. */
function pagingOf(list: CardPages, fallbackTotal: number): PagerPaging {
  return {
    total: list.total ?? fallbackTotal,
    loading: list.status === "pending" || list.loadingMore,
    // An error without a text still counts as a failure: the Pager would ask for the page again and again.
    ...(list.error === undefined ? {} : { failure: list.error.text || t("list.failed") }),
    onMore: list.loadMore,
    onRetry: list.retry,
    loadingText: t("list.loading"),
    retryText: t("list.retry"),
  };
}

function Tiles(props: Props & { items: readonly SpecimenCard[]; resetKey: string }) {
  const size = usePageSize();
  return (
    <Pager
      items={props.items}
      pageSize={size}
      fit
      label="Pflanzen"
      resetKey={props.resetKey}
      getKey={(card) => card.id}
      listClassName={TILES}
      paging={pagingOf(props.plants, props.summary.total)}
      renderItem={(card) => <PlantTile card={card} access={props.photoAccess} />}
    />
  );
}

/**
 * The plants by location (US-QS-14, US-QS-19): the groups and their counts come from the server's summary; the chosen
 * group loads its own plants with the location filter, paged like the list (FR-BES-23). Other groups load nothing.
 */
function Grouped(props: Props) {
  const size = usePageSize();
  const choices = locationChoices(props.summary.groups, props.summary.unplaced);
  const chosen = usePart(choices);
  const key = chosen?.key;
  const filter = key === undefined ? {} : { location: key === UNPLACED_KEY ? "none" : key };
  const list = useCardPages(
    props.photoAccess.api,
    props.photoAccess.token,
    filter,
    chosen !== undefined,
  );
  // The zone is the first plant's, as before; it is left out until the group is loaded (P-08).
  const zone = list.status === "ready" ? (list.cards[0]?.lightZone ?? null) : undefined;
  const title = chosen ? groupTitle(chosen.label, zone, chosen.count) : "";
  const groups: PagedGroup<SpecimenCard>[] = choices.map((c) => {
    const on = c.key === chosen?.key;
    return {
      key: c.key,
      label: c.label,
      count: c.count,
      items: on ? list.cards : [],
      ...(on ? { paging: pagingOf(list, c.count) } : {}),
    };
  });
  return (
    <PagedGroups
      choicesLabel="Standort wählen"
      listLabel="Pflanzen"
      groups={groups}
      pageSize={size}
      fit
      listClassName={TILES}
      getKey={(card) => card.id}
      renderItem={(card) => <PlantTile card={card} access={props.photoAccess} />}
      intro={() => <p className="text-sm text-muted-foreground">{title}</p>}
    />
  );
}

function Row(props: Props) {
  const archive = useLayer(ARCHIVE_LAYER);
  return (
    // Wraps at a larger text size, so the insight keeps its longest word whole (issue 1113).
    <div className="flex flex-wrap items-center gap-2">
      <ZoneInsightRow distribution={props.distribution} />
      {props.archived.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          onClick={(event) => archive.openLayer(event.currentTarget)}
        >
          Archiv ({props.archived.length})
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon"
        aria-label="Weitere Pflanze"
        onClick={props.onSpeciesChoose}
      >
        <Plus aria-hidden="true" className="size-5" />
      </Button>
    </div>
  );
}

/**
 * The plants of the Sammlung on one screen (US-QS-19): one insight row about the light zones and a page of compact
 * tiles. The grouping is chosen in the layer "Ansicht", the group from a row; the layers hold the zones, the archive
 * and the plant with its card and actions. Every view says what to do next (P-09).
 */
export function PlantsScreen(props: Props) {
  const body =
    props.summary.total === 0 ? (
      <EmptyState
        title="Du hast noch keine Pflanze."
        description="Wähle zuerst eine Art aus dem Katalog."
        action={{ label: "Art wählen", onClick: props.onSpeciesChoose }}
      />
    ) : props.groupBy === "location" ? (
      <Grouped {...props} />
    ) : (
      <Tiles {...props} items={props.cards} resetKey="all" />
    );
  return (
    <section aria-labelledby="collection-title" className="flex flex-1 flex-col">
      {/* No min-h-0: at a larger text size the section grows with its content and scrolls in the frame (issue 1113). */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {props.embedded ? (
          <h2 id="collection-title" className="sr-only">
            Pflanzen
          </h2>
        ) : (
          <h1 id="collection-title" className={TITLE}>
            Sammlung
          </h1>
        )}
        <Row {...props} />
        {body}
      </div>
      <PlantLayers {...props} />
    </section>
  );
}
