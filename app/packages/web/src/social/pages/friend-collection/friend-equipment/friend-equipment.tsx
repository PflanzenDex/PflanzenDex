import { useCallback } from "react";
import type { SharedDevice } from "@pflanzendex/core";
import { LAYER_PARAM, Pager } from "@/components/shared/responsive/pager/pager";
import { LoadFrame } from "../../../../kernel";
import { loadFriendEquipment } from "../../../api/friends-api";

/** The German names of the equipment types (the codes stay English; the same names as under "Equipment"). */
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

function Device({ d }: { d: SharedDevice }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <h3 className="break-words font-semibold">{d.name}</h3>
      <p className="m-0 text-sm text-muted-foreground">{label(d.type)}</p>
      <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt>Modell</dt>
        <dd className="m-0">{d.model ?? "unbekannt"}</dd>
        {d.type === "Lamp" ? (
          <>
            <dt>Lichtstufe</dt>
            <dd className="m-0">
              {d.luxCeiling === null
                ? "unbekannt"
                : `bis ${d.luxCeiling.toLocaleString("de-DE")} lx`}
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
  return (
    <section aria-labelledby="friend-equipment-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="friend-equipment-title" className="sr-only">
        Geräte von {name}
      </h2>
      <LoadFrame
        queryKey={["social", "friend-equipment", friendId]}
        token={props.token}
        load={load}
        loadingText="Geräte werden geladen …"
      >
        {(data) =>
          data.devices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3">
              {name} hat noch kein Gerät freigegeben. Gib selbst unter „Equipment“ ein Gerät für
              Freunde frei, wenn du deine Erfahrung teilen möchtest.
            </p>
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
