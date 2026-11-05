import { useSearchParams } from "react-router";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { Button } from "@/shared/ui/button/button";
import { texts } from "@/shared/lib/text-rules/texts";
import { useRequest } from "../../../shared/data";
import { DistributionView } from "../../insights/distribution-view/distribution-view";
import { ArchivedList } from "../../archived/archived-list/archived-list";
import { loadCard } from "../../specimens/cards/cards-api";
import { COLLECTION_KEY } from "../../specimens/hooks/use-collection";
import { PlantLayer } from "./plant-layer/plant-layer";
import { CareProfileLayer, careProfileLayerId } from "./plant-layer/plant-care-tab/plant-care-tab";
import { plantLayerId } from "../rows/plant-tile/plant-tile";
import { ZONES_LAYER } from "../rows/zone-insight/zone-insight";
import { ARCHIVE_LAYER, type LayerProps } from "./layer-ids";
import table from "./plant-layers.de.json";

const t = texts(table);

/** The ID of the plant a layer address names: `plant-<id>` or `profil-<id>` (US-QS-19, US-QS-23); `undefined` otherwise. */
function plantIdOf(sheet: string | null): string | undefined {
  return /^(?:plant|profil)-(.+)$/.exec(sheet ?? "")?.[1];
}

/**
 * The plant a layer address names, also when it is not in the loaded plants (a direct link, FR-BES-23): it is read by its
 * ID, and a plant that does not exist answers with its error, which the layer shows (P-10).
 */
function useLayerPlant(props: LayerProps, id: string | undefined) {
  const loaded = id === undefined ? undefined : props.cards.find((c) => c.id === id);
  const direct = useRequest({
    queryKey: [...COLLECTION_KEY, "card", id ?? ""],
    token: props.photoAccess.token,
    enabled: id !== undefined && loaded === undefined,
    load: (token) => loadCard(props.photoAccess.api, token, id ?? ""),
  });
  return { card: loaded ?? direct.value, direct };
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

/** The layers of the plants: the light zones, the archive and the plant of a chosen tile with its tabs (US-QS-19, US-QS-23). */
export function PlantLayers(props: LayerProps) {
  const [params] = useSearchParams();
  const sheet = params.get("sheet");
  const { card, direct } = useLayerPlant(props, plantIdOf(sheet));
  const plant = card && plantLayerId(card.id) === sheet ? card : undefined;
  const profile = card && careProfileLayerId(card.id) === sheet ? card : undefined;
  // A plant that is being read, or could not be read, has its layer with that state (P-10), never a silent nothing.
  const unread = plantIdOf(sheet) !== undefined && card === undefined;
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
      {unread && sheet ? (
        <LayerSheet
          id={sheet}
          title={t(sheet.startsWith("profil-") ? "layer.profile" : "layer.plant")}
        >
          <RequestState
            status={direct.status}
            {...(direct.error ? { errorText: direct.error.text } : {})}
            onRetry={direct.retry}
          >
            {null}
          </RequestState>
        </LayerSheet>
      ) : null}
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
      {profile ? <CareProfileLayer card={profile} access={props.photoAccess} /> : null}
    </>
  );
}
