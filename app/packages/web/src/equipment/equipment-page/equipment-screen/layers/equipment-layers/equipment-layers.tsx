import type { ReactNode } from "react";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
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
import { NEW_WISH_LAYER, WishesView } from "../../../../overviews/wishes-view/wishes-view";
import { WishForm } from "../../../../overviews/wishes-view/wish-form/wish-form";
import type { EquipmentPrefill } from "../../../../overviews/wishes-view/wishes-api";
import { ZonesView } from "../../../../overviews/zones-view/zones-view";
import type { useLampActions } from "../../../lamp-actions/lamp-actions";
import type { useWishActions } from "../../../../overviews/wishes-view/use-wish-actions";
import { ItemLayer, ItemRow } from "../../item-layer/item-layer";
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
import { texts } from "@/lib/text-rules/texts";
import table from "../../../../equipment.de.json";

const t = texts(table);

/** Rows per page of the list of what I own (starting value, assumption; the page size from the free height is #1029). */
const ITEMS_PER_PAGE = 6;

type Lamps = ReturnType<typeof useLampActions>;
type Wishes = ReturnType<typeof useWishActions>;

/** A part with nothing recorded says so and names the next step (P-09). */
function Nothing(props: { title: string; description: string }) {
  return <EmptyState level={3} title={props.title} description={props.description} />;
}

function Items(props: { data: EquipmentData; lamps: Lamps }) {
  const { data } = props;
  const zoneNames = new Map(data.zones.zones.map((z) => [z.zoneId, zoneLabel(z.name)]));
  if (data.items.length === 0)
    return <Nothing title={t("items.none.title")} description={t("items.none.description")} />;
  return (
    <Pager
      items={data.items}
      pageSize={ITEMS_PER_PAGE}
      label={t("items.label")}
      param={LAYER_PARAM}
      getKey={(item) => item.id}
      renderItem={(item) => <ItemRow item={item} zone={zoneNames.get(item.lightZoneId ?? "")} />}
    />
  );
}

function CostsPart({ data }: { data: EquipmentData }) {
  if (data.items.length > 0) return <CostsView items={data.items} />;
  return <Nothing title={t("costs.none.title")} description={t("costs.none.description")} />;
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
        <Nothing title={t("lamps.none.title")} description={t("lamps.none.description")} />
      ) : null}
    </>
  );
}

function SensorsPart({ data, lamps }: { data: EquipmentData; lamps: Lamps }) {
  if (data.sensors.sensors.length > 0)
    return <SensorsView view={data.sensors} actions={lamps.sensors} />;
  return <Nothing title={t("sensors.none.title")} description={t("sensors.none.description")} />;
}

/**
 * The form of a new equipment wish as a layer of its own (US-EQU-08, issue 1154): saving closes it, so the keeper is back
 * at the wishes, where the new one is listed.
 */
function NewWishLayer(props: { actions: Wishes["actions"] }) {
  const { closeLayer } = useLayer(NEW_WISH_LAYER);
  const { actions } = props;
  return (
    <LayerSheet id={NEW_WISH_LAYER} title={t("layers.newWish")}>
      <WishForm
        busy={actions.busy}
        onCreate={async (input) => {
          const saved = await actions.onCreate(input);
          if (saved) closeLayer();
          return saved;
        }}
      />
    </LayerSheet>
  );
}

/** The wishes and, above them, the form of a new one (US-EQU-08, issue 1154). */
function WishLayers(props: {
  data: EquipmentData;
  actions: Wishes["actions"];
  outcome: ReactNode;
}) {
  return (
    <>
      <LayerSheet id={WISHES_LAYER} title={t("layers.wishes")}>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {props.outcome}
          <WishesView wishes={props.data.wishes} actions={props.actions} />
        </div>
      </LayerSheet>
      <NewWishLayer actions={props.actions} />
    </>
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
      <LayerSheet id={ITEMS_LAYER} title={t("layers.items")}>
        <div className="flex flex-col gap-3">
          {props.outcome}
          <Items data={data} lamps={lamps} />
        </div>
      </LayerSheet>
      <ItemLayer data={data} lamps={lamps} />
      <LayerSheet id={COSTS_LAYER} title={t("layers.costs")}>
        <CostsPart data={data} />
      </LayerSheet>
      <LayerSheet id={NEEDS_LAYER} title={t("layers.needs")}>
        {/* The needs page by the free height of the layer; the recommendations stay below them (issue 1154). */}
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <NeedsView needs={data.needs} />
          <RecommendationsView data={data} />
        </div>
      </LayerSheet>
      <LayerSheet id={LAMPS_LAYER} title={t("layers.lamps")}>
        <div className="flex flex-col gap-4">
          {props.outcome}
          <LampsPart data={data} lamps={lamps} />
        </div>
      </LayerSheet>
      <LayerSheet id={SENSORS_LAYER} title={t("layers.sensors")}>
        <div className="flex flex-col gap-3">
          {props.outcome}
          <SensorsPart data={data} lamps={lamps} />
        </div>
      </LayerSheet>
      <WishLayers data={data} actions={props.wishes.actions} outcome={props.outcome} />
      <LayerSheet id={NEW_LAYER} title={t("layers.new")}>
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
