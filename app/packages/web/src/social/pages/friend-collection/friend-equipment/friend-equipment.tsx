import { useCallback } from "react";
import type { SharedDevice } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { withUnit } from "@/shared/lib/format";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { loadFriendEquipment } from "../../../api/friends-api";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../social.de.json";
import { FriendEquipmentSkeleton } from "./friend-equipment.skeleton";

/** The German names of the equipment types (the codes stay English; the same names as under "Equipment"). */
const t = texts(table);

const TYPE_LABELS: Record<string, string> = {
  Lamp: "Lampe",
  Timer: "Zeitschaltuhr",
  Sensor: "Sensor",
  Ventilation: "Lüftung",
  Pump: "Pumpe",
  Pot: "Topf",
  Substrate: "Substrat",
  Fertilizer: "Dünger",
  "Plant agent": "Pflanzenmittel",
  Other: "Sonstiges",
};
/** Devices per page in the layer (starting value, assumption; #1029). */
const DEVICES_PER_PAGE = 2;

const label = (type: string) => TYPE_LABELS[type] ?? type;

/** The layer of a friend's devices on the friend's collection page (US-EQU-12). */
export const EQUIPMENT_LAYER = "equipment";

/** "Geräte" opens the devices the friend shares in a layer (US-EQU-12), so they no longer stand below the cards. */
export function FriendEquipmentOpener() {
  const layer = useLayer(EQUIPMENT_LAYER);
  return (
    <Button
      type="button"
      variant="plain"
      size="sm"
      aria-haspopup="dialog"
      onClick={(event) => layer.openLayer(event.currentTarget)}
    >
      {t("friendCollection.devices")}
    </Button>
  );
}

function Device({ d }: { d: SharedDevice }) {
  return (
    <div className="@container min-w-0 rounded-lg border border-border p-3">
      <h3 className="break-words font-semibold">{d.name}</h3>
      <p className="m-0 text-sm text-muted-foreground">{label(d.type)}</p>
      <dl className="m-0 mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm @min-[12rem]:grid-cols-[auto_minmax(0,1fr)]">
        <dt>Modell</dt>
        <dd className="m-0">{d.model ?? "unbekannt"}</dd>
        {d.type === "Lamp" ? (
          <>
            <dt>Lichtstufe</dt>
            <dd className="m-0">
              {d.luxCeiling === null ? "unbekannt" : `bis ${withUnit(d.luxCeiling, "lx")}`}
            </dd>
          </>
        ) : null}
      </dl>
      {d.note ? <p className="mt-2 break-words text-sm">{d.note}</p> : null}
    </div>
  );
}

/**
 * The devices a friend shares (US-EQU-12): type, name, model, the light level of a lamp's zone and the friend's own note;
 * never price, place of purchase, serial number, location or purchase date. They appear only here, not in the feed, and
 * never come with a recommendation (FR-EQU-07). Only what the friend shares (P-05).
 */
export function FriendEquipment(props: {
  api: string;
  token: () => Promise<string | undefined>;
  friendId: string;
  name: string;
}) {
  const { api, friendId, name } = props;
  const load = useCallback((t: string) => loadFriendEquipment(api, t, friendId), [api, friendId]);
  // No heading of its own: the layer's title is the one heading and names the dialog (US-QS-32, issue 2002, F-0267); the list is named below.
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <LoadFrame
        queryKey={["social", "friend-equipment", friendId]}
        token={props.token}
        load={load}
        loadingText={t("equipment.loading")}
        loadingFallback={<FriendEquipmentSkeleton label={t("equipment.loading")} />}
      >
        {(data) =>
          data.devices.length === 0 ? (
            <EmptySection text={t("friendEquipment.none", { name })} />
          ) : (
            <Pager
              items={data.devices}
              pageSize={DEVICES_PER_PAGE}
              label={`Geräte von ${name}`}
              param={LAYER_PARAM}
              replace
              getKey={(d) => d.id}
              renderItem={(d) => <Device d={d} />}
            />
          )
        }
      </LoadFrame>
    </section>
  );
}
