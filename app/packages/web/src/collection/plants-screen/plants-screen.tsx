import type { SpecimenCard } from "@pflanzendex/core";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { PagedGroups } from "@/components/shared/responsive/paged-groups/paged-groups";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { Button } from "@/components/ui/button/button";
import { groupByLocation } from "@/components/sammlung-header/location-groups/group-by-location";
import { useIsLg, useIsMd } from "@/lib/use-breakpoint";
import { TITLE } from "../specimens/cards/parts/parts";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { PlantTile } from "./rows/plant-tile/plant-tile";
import { PlantLayers } from "./plant-layers/plant-layers";
import { ARCHIVE_LAYER, type LayerProps } from "./plant-layers/layer-ids";
import { ZoneInsightRow } from "./rows/zone-insight/zone-insight";

/** Tiles per page (starting values, assumption): 2 columns below 768 px, 3 from 768 px, 4 from 1024 px. */
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
};

const TILES = "grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4";

function Tiles(props: Props & { items: readonly SpecimenCard[]; resetKey: string }) {
  const size = usePageSize();
  return (
    <Pager
      items={props.items}
      pageSize={size}
      label="Pflanzen"
      resetKey={props.resetKey}
      getKey={(card) => card.id}
      listClassName={TILES}
      renderItem={(card) => <PlantTile card={card} access={props.photoAccess} />}
    />
  );
}

/** The plants by location: known locations alphabetically, "Standort unbekannt" last (US-QS-14, US-QS-19). */
function Grouped(props: Props) {
  const size = usePageSize();
  const groups = groupByLocation(props.cards).map((g) => ({
    key: g.key,
    label: g.key === "unknown" ? "Standort unbekannt" : g.key,
    items: g.items,
    title: g.title,
  }));
  return (
    <PagedGroups
      choicesLabel="Standort wählen"
      listLabel="Pflanzen"
      groups={groups}
      pageSize={size}
      listClassName={TILES}
      getKey={(card) => card.id}
      renderItem={(card) => <PlantTile card={card} access={props.photoAccess} />}
      intro={(g) => (
        <p className="text-sm text-muted-foreground">
          {groups.find((x) => x.key === g.key)?.title}
        </p>
      )}
    />
  );
}

function Row(props: Props) {
  const archive = useLayer(ARCHIVE_LAYER);
  return (
    <div className="flex items-center gap-2">
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
    props.cards.length === 0 ? (
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
    <section aria-labelledby="collection-title" className="min-h-0">
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
