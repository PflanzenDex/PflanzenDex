import { useSearchParams } from "react-router";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Button } from "@/components/ui/button/button";
import { DistributionView } from "../../insights/distribution-view/distribution-view";
import { ArchivedList } from "../../archived/archived-list/archived-list";
import { PlantLayer } from "./plant-layer/plant-layer";
import { plantLayerId } from "../rows/plant-tile/plant-tile";
import { ZONES_LAYER } from "../rows/zone-insight/zone-insight";
import { ARCHIVE_LAYER, type LayerProps } from "./layer-ids";

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

/** The layers of the plants: the light zones, the archive and the plant of a chosen tile with its tabs (US-QS-19, US-QS-23). */
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
          slots={props.slots}
          locations={props.locations}
          onLocate={props.onLocate}
          onManage={props.onManage}
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
