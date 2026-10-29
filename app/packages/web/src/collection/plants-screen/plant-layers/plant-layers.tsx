import { useSearchParams } from "react-router";
import type { SpecimenCard } from "@pflanzendex/core";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Button } from "@/components/ui/button/button";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { DistributionView } from "../../insights/distribution-view/distribution-view";
import { ArchivedList } from "../../archived/archived-list/archived-list";
import { SpecimenCardView } from "../../specimens/cards/specimen-card/specimen-card";
import { plantLayerId } from "../rows/plant-tile/plant-tile";
import { ZONES_LAYER } from "../rows/zone-insight/zone-insight";
import { ARCHIVE_LAYER, type Handlers, type LayerProps } from "./layer-ids";

/** An action of a layer closes the layer first, so the result or the form is not hidden behind it (P-10). */
function closing<E>(
  close: () => void,
  act: ((e: E) => void) | undefined,
): ((e: E) => void) | undefined {
  return act
    ? (e) => {
        close();
        act(e);
      }
    : undefined;
}

function PlantLayer({ card, ...h }: Handlers & { card: SpecimenCard; photoAccess: PhotoAccess }) {
  const id = plantLayerId(card.id);
  const { closeLayer } = useLayer(id);
  return (
    <LayerSheet id={id} title={card.name}>
      <ul className="m-0 grid list-none gap-3 p-0">
        <SpecimenCardView
          card={card}
          showName={false}
          photoAccess={h.photoAccess}
          onMeasure={closing(closeLayer, h.onMeasure)}
          onArchive={closing(closeLayer, h.onArchive)}
          onRepot={closing(closeLayer, h.onRepot)}
          onMark={closing(closeLayer, h.onMark)}
          onCatchDate={closing(closeLayer, h.onCatchDate)}
          onLightZone={closing(closeLayer, h.onLightZone)}
        />
      </ul>
    </LayerSheet>
  );
}

function ArchiveLayer(props: LayerProps) {
  const { closeLayer } = useLayer(ARCHIVE_LAYER);
  return (
    <LayerSheet id={ARCHIVE_LAYER} title="Archiv">
      <ArchivedList
        entries={props.archived}
        onRestore={(e) => {
          closeLayer();
          props.onRestore(e);
        }}
        onCatchDate={(e) => {
          closeLayer();
          props.onArchivedCatchDate(e);
        }}
      />
    </LayerSheet>
  );
}

/** The layers of the plants: the light zones, the archive and the plant of a chosen tile (US-QS-19). */
export function PlantLayers(props: LayerProps) {
  const [params] = useSearchParams();
  const plant = props.cards.find((c) => plantLayerId(c.id) === params.get("sheet"));
  return (
    <>
      <LayerSheet id={ZONES_LAYER} title="Lichtzonen">
        <div className="flex flex-col gap-3">
          <DistributionView distribution={props.distribution} />
          <Button type="button" variant="outline" onClick={props.onManage}>
            Standorte und Lichtzonen verwalten
          </Button>
        </div>
      </LayerSheet>
      {props.archived.length > 0 ? <ArchiveLayer {...props} /> : null}
      {plant ? (
        <PlantLayer
          card={plant}
          photoAccess={props.photoAccess}
          onMeasure={props.onMeasure}
          onArchive={props.onArchive}
          onRepot={props.onRepot}
          onMark={props.onMark}
          onCatchDate={props.onCatchDate}
          onLightZone={props.onLightZone}
        />
      ) : null}
    </>
  );
}
