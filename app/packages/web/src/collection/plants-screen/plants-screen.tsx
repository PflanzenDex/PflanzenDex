import type { SpecimenCard, SpecimenSummary } from "@pflanzendex/core";
import { Plus } from "lucide-react";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { ScrollEntries } from "@/shared/patterns/responsive/pager/paging/scroll-entries/scroll-entries";
import { Button } from "@/shared/ui/button";
import type { CardPages } from "../specimens/cards/use-card-pages";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { PlantTile } from "./rows/plant-tile/plant-tile";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { PlantLayers } from "./plant-layers/plant-layers";
import { ARCHIVE_LAYER, plantHintOccasionsOf, type LayerProps } from "./plant-layers/layer-ids";
import { LocationSections } from "./location-sections/location-sections";
import { pagingOf, usePageSize } from "./plants-parts/plants-paging/plants-paging";
import { ZoneInsightRow } from "./rows/zone-insight/zone-insight";
import { PageHeader } from "@/shared/patterns/navigation/page-header/page-header";

type Props = LayerProps & {
  /** Adds a plant: the app opens the quick flow (US-ONB-01), otherwise the species catalog. */
  onSpeciesChoose: () => void;
  /** Shown below the title of a destination: the heading is then a screen reader section name. */
  embedded?: boolean;
  /** Groups the plants by location and zone: one section per location, chips jump to it (SG-LIST-06). */
  groupBy?: "location";
  /** The plants as the server pages them (FR-BES-23): `cards` of the layer props are the loaded ones of this list. */
  plants: CardPages;
  /** The counts over all plants (US-BES-06): the empty state, the total and the groups come from them. */
  summary: SpecimenSummary;
};

// The plants are one flat group in one column at every width (US-QS-32, FX-35): no group inside a group.
const TILES = OBJECT_GROUP;

function Tiles(props: Props & { items: readonly SpecimenCard[]; resetKey: string }) {
  const size = usePageSize();
  return (
    <ScrollEntries
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
            variant="plain"
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
      <LocationSections
        summary={props.summary}
        photoAccess={props.photoAccess}
        level={props.embedded ? 3 : 2}
      />
    ) : (
      <Tiles {...props} items={props.cards} resetKey="all" />
    );
  return (
    <section aria-labelledby="collection-title" className="flex min-h-0 flex-1 flex-col">
      {/* min-h-0: the list below the title takes the free height and scrolls in its box; at a larger text size the list keeps its minimum and the frame scrolls (issue 1113). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
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
