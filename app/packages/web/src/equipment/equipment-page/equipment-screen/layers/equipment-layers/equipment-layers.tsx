import type { ReactNode } from "react";
import { LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import type { ApiError } from "../../../../../kernel";
import { EquipmentForm } from "../../../../equipment-form/equipment-form";
import type { EquipmentData, EquipmentInput } from "../../../../equipment-api";
import { LampLightView } from "../../../../lamp-light/lamp-light";
import { CostsView } from "../../../../overviews/costs-view/costs-view";
import { NeedsView } from "../../../../overviews/needs-view/needs-view";
import { RecommendationsView } from "../../../../overviews/needs-view/recommendations-view/recommendations-view";
import { SensorsView } from "../../../../overviews/sensors-view/sensors-view";
import { WishesView } from "../../../../overviews/wishes-view/wishes-view";
import type { EquipmentPrefill } from "../../../../overviews/wishes-view/wishes-api";
import { ZonesView } from "../../../../overviews/zones-view/zones-view";
import type { useLampActions } from "../../../lamp-actions/lamp-actions";
import type { useWishActions } from "../../../../overviews/wishes-view/use-wish-actions";
import { ItemCard } from "../../item-card/item-card";
import {
  COSTS_LAYER,
  ITEMS_LAYER,
  LAMPS_LAYER,
  NEEDS_LAYER,
  NEW_LAYER,
  SENSORS_LAYER,
  WISHES_LAYER,
} from "../../tiles/equipment-tiles/equipment-tiles";
import { zoneLabel } from "@pflanzendex/core";

type Lamps = ReturnType<typeof useLampActions>;
type Wishes = ReturnType<typeof useWishActions>;

/** A part with nothing recorded says so and names the next step (P-09). */
function Nothing(props: { title: string; description: string }) {
  return <EmptyState level={3} title={props.title} description={props.description} />;
}

function Items(props: { data: EquipmentData; lamps: Lamps }) {
  const { data, lamps } = props;
  const zoneNames = new Map(data.zones.zones.map((z) => [z.zoneId, zoneLabel(z.name)]));
  if (data.items.length === 0)
    return (
      <Nothing
        title="Noch kein Equipment erfasst"
        description="Erfasse Lampen, Zeitschaltuhren, Substrat und mehr mit „Equipment erfassen“. Nur Art und Name sind nötig."
      />
    );
  return (
    <Pager
      items={data.items}
      pageSize={2}
      label="Dein Equipment"
      param={LAYER_PARAM}
      getKey={(item) => item.id}
      renderItem={(item) => (
        <ItemCard
          item={item}
          zone={zoneNames.get(item.lightZoneId ?? "")}
          maintenance={lamps.maintenance}
          supply={lamps.supply}
          sharing={lamps.sharing}
        />
      )}
    />
  );
}

function CostsPart({ data }: { data: EquipmentData }) {
  if (data.items.length > 0) return <CostsView items={data.items} />;
  return (
    <Nothing
      title="Noch keine Kosten"
      description="Sie erscheinen, sobald du Equipment mit Preis erfasst."
    />
  );
}

function LampsPart({ data, lamps }: { data: EquipmentData; lamps: Lamps }) {
  const none =
    data.zones.zones.length === 0 &&
    data.zones.unassigned.length === 0 &&
    data.light.lamps.length === 0;
  return (
    <>
      <ZonesView view={data.zones} actions={lamps.actions} />
      <LampLightView view={data.light} actions={lamps.light} />
      {none ? (
        <Nothing
          title="Noch keine Lampe erfasst"
          description="Erfasse eine Lampe mit „Equipment erfassen“; sie bekommt eine Lichtzone."
        />
      ) : null}
    </>
  );
}

function SensorsPart({ data, lamps }: { data: EquipmentData; lamps: Lamps }) {
  if (data.sensors.sensors.length > 0)
    return <SensorsView view={data.sensors} actions={lamps.sensors} />;
  return (
    <Nothing
      title="Noch kein Sensor erfasst"
      description="Erfasse einen Sensor mit „Equipment erfassen“ und ordne ihn dann einer Pflanze oder einem Standort zu."
    />
  );
}

/**
 * The layers of the equipment (US-QS-22): the list of what I own (paged), the costs, the needs, the lamps with their zones
 * and light, the sensors, the wishes and the form. Each mounts its content only while it is open.
 */
export function EquipmentLayers(props: {
  data: EquipmentData;
  lamps: Lamps;
  wishes: Wishes;
  prefill: EquipmentPrefill | null;
  /** The outcome of a write inside a layer; the screen behind it is covered (P-10). */
  outcome: ReactNode;
  running: boolean;
  error: ApiError | null;
  onSend: (input: EquipmentInput) => Promise<boolean>;
}) {
  const { data, lamps } = props;
  return (
    <>
      <LayerSheet id={ITEMS_LAYER} title="Equipment">
        <div className="flex flex-col gap-3">
          {props.outcome}
          <Items data={data} lamps={lamps} />
        </div>
      </LayerSheet>
      <LayerSheet id={COSTS_LAYER} title="Kosten">
        <CostsPart data={data} />
      </LayerSheet>
      <LayerSheet id={NEEDS_LAYER} title="Bedarf">
        <div className="flex flex-col gap-4">
          <NeedsView needs={data.needs} />
          <RecommendationsView data={data} />
        </div>
      </LayerSheet>
      <LayerSheet id={LAMPS_LAYER} title="Lampen und Zonen">
        <div className="flex flex-col gap-4">
          {props.outcome}
          <LampsPart data={data} lamps={lamps} />
        </div>
      </LayerSheet>
      <LayerSheet id={SENSORS_LAYER} title="Sensoren">
        <div className="flex flex-col gap-3">
          {props.outcome}
          <SensorsPart data={data} lamps={lamps} />
        </div>
      </LayerSheet>
      <LayerSheet id={WISHES_LAYER} title="Equipment-Wünsche">
        <div className="flex flex-col gap-3">
          {props.outcome}
          <WishesView wishes={data.wishes} actions={props.wishes.actions} />
        </div>
      </LayerSheet>
      <LayerSheet id={NEW_LAYER} title="Neues Equipment">
        <EquipmentForm
          prefill={props.prefill}
          zones={data.zones.zones}
          running={props.running}
          message={null}
          error={props.error}
          onSend={props.onSend}
        />
      </LayerSheet>
    </>
  );
}
