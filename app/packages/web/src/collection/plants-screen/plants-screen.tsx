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
import { useIsLg } from "@/shared/platform/visibility/use-lg-breakpoint";
import { useIsMd } from "@/shared/platform/browser/use-breakpoint";
import { useCardPages, type CardPages } from "../specimens/cards/use-card-pages";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { PlantTile, PlantTileSkeleton } from "./rows/plant-tile/plant-tile";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { PlantLayers } from "./plant-layers/plant-layers";
import { ARCHIVE_LAYER, plantHintOccasionsOf, type LayerProps } from "./plant-layers/layer-ids";
import { ZoneInsightRow } from "./rows/zone-insight/zone-insight";
import table from "./plant-layers/plant-layers.de.json";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";

const t = texts(table);
/**
 * Rows per page without a layout (starting values, assumption): 6 below 768 px (one column), 12 from 768 px (two columns), 16 from 1024 px.
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

// The plants are one flat group in one column at every width (US-QS-32, FX-35): no group inside a group.
const TILES = OBJECT_GROUP;

/** The server paging of a list of plants for the Pager (FR-BES-23): total, loading state, failure, tile skeleton (F-0124). */
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
    placeholder: <PlantTileSkeleton />,
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
    // The light-zone row is a row of its own above the buttons (F-0114, US-QS-32); the buttons wrap at a larger text size.
    <div className="flex flex-col gap-2">
      <ZoneInsightRow distribution={props.distribution} />
      <div className="flex flex-wrap items-center gap-2">
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
          aria-label="Pflanze anlegen"
          onClick={props.onSpeciesChoose}
        >
          <Plus aria-hidden="true" className="size-5" />
        </Button>
      </div>
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
        title="Du hast noch keine Pflanze"
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
          <PageHeader headingId="collection-title" title="Sammlung" />
        )}
        <Row {...props} />
        {body}
      </div>
      <PlantLayers {...props} hintOccasions={plantHintOccasionsOf(props.summary)} />
    </section>
  );
}
