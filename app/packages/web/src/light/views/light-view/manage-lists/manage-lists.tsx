import { Plus } from "lucide-react";
import { useSearchParams } from "react-router";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LayerOpener, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import { zoneLabel } from "@pflanzendex/core";
import type { LightData } from "../../../shared/light-api/light-api";
import { lux, kindText, zoneName } from "../../../shared/texts";
import { zoneLayerId } from "../../../zones/zone-layer/zone-layer";
import { locationLayerId } from "../../../zones/location-layer/location-layer";
import { HINTS, NEW_LOCATION, NEW_ZONE, REFERENCE } from "../light-layers/light-layers";
import type { LightActions } from "../light-view";
import { LightRow } from "../light-row/light-row";

/** The list on a phone: `zones` (default) or `locations`, in the address (US-QS-19). */
export const LIST_PARAM = "list";
/** The page of each list; two names, because on a desktop both lists stand side by side. */
const ZONE_PAGE = "zpage";
const LOCATION_PAGE = "spage";
type ListKind = "zones" | "locations";

/** The "+" of a list: opens the create layer of that kind (US-QS-19). */
function AddButton({ kind }: { kind: ListKind }) {
  const { openLayer } = useLayer(kind === "zones" ? NEW_ZONE : NEW_LOCATION);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-haspopup="dialog"
      aria-label={kind === "zones" ? "Neue Lichtzone" : "Neuer Standort"}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <Plus aria-hidden="true" className="size-5" />
    </Button>
  );
}

/** Heading of a list on a desktop, where both lists stand side by side (phones name the list in the segment). */
function ColumnHeader({ title, kind }: { title: string; kind: ListKind }) {
  return (
    <div className="hidden items-center justify-between gap-2 md:flex">
      <h2 className="text-lg font-semibold">{title}</h2>
      <AddButton kind={kind} />
    </div>
  );
}

const column = (active: boolean) =>
  cn("min-w-0 flex-col gap-3 md:flex", active ? "flex" : "hidden");

/** The list of the zones: rows with their lux ceiling, paged (US-QS-19). */
function ZoneColumn(props: {
  zones: LightData["zones"];
  active: boolean;
  size: number;
  actions: LightActions;
}) {
  return (
    <section aria-label="Lichtzonen" className={column(props.active)}>
      <ColumnHeader title="Lichtzonen" kind="zones" />
      {props.zones.length === 0 ? (
        <ZoneEmpty actions={props.actions} />
      ) : (
        <Pager
          items={props.zones}
          pageSize={props.size}
          label="Lichtzonen"
          param={ZONE_PAGE}
          getKey={(z) => z.id}
          renderItem={(z) => (
            <LightRow
              name={zoneLabel(z.name)}
              meta={`bis ${lux(z.luxCeiling)}`}
              layer={zoneLayerId(z.id)}
            />
          )}
        />
      )}
    </section>
  );
}

/** The list of the locations: rows with their zone and kind, paged (US-QS-19). */
function LocationColumn(props: { data: LightData; active: boolean; size: number }) {
  const { data } = props;
  return (
    <section aria-label="Standorte" className={column(props.active)}>
      <ColumnHeader title="Standorte" kind="locations" />
      {data.locations.length === 0 ? (
        <LocationEmpty />
      ) : (
        <Pager
          items={data.locations}
          pageSize={props.size}
          label="Standorte"
          param={LOCATION_PAGE}
          getKey={(s) => s.id}
          renderItem={(s) => (
            <LightRow
              name={s.name}
              meta={`${zoneName(data.zones, s.lightZoneId) ?? "Keine Lichtzone"} · ${kindText(s.kind)}`}
              layer={locationLayerId(s.id)}
            />
          )}
        />
      )}
    </section>
  );
}

/**
 * The zones and the locations of the account (US-QS-19): on a phone one list at a time, chosen by two segments with
 * their counts and the "+" of the chosen list beside them; from 768 px both lists side by side, each with its own
 * heading and "+". Each list is paged with compact rows (`Pager`, page size from the width).
 */
export function ManageLists({ data, actions }: { data: LightData; actions: LightActions }) {
  const [params, setParams] = useSearchParams();
  const size = useRowPageSize();
  const list: ListKind = params.get(LIST_PARAM) === "locations" ? "locations" : "zones";
  const choose = (next: ListKind) => {
    const query = new URLSearchParams(params);
    if (next === "zones") query.delete(LIST_PARAM);
    else query.set(LIST_PARAM, "locations");
    setParams(query, { state: { keepFocus: true } });
  };
  return (
    <>
      <div className="flex items-center justify-between gap-2 md:hidden">
        <SegmentedControl
          label="Lichtzonen und Standorte"
          options={[
            { value: "zones", label: `Lichtzonen (${data.zones.length})` },
            { value: "locations", label: `Standorte (${data.locations.length})` },
          ]}
          value={list}
          onChange={choose}
        />
        <AddButton kind={list} />
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <ZoneColumn zones={data.zones} active={list === "zones"} size={size} actions={actions} />
        <LocationColumn data={data} active={list === "locations"} size={size} />
      </div>
    </>
  );
}

function ZoneEmpty({ actions }: { actions: LightActions }) {
  return (
    <EmptyState
      title="Noch keine Lichtzonen"
      description="Übernimm die vier Standard-Zonen oder lege eine eigene Zone an."
      action={{ label: "Standard-Zonen übernehmen", onClick: () => void actions.defaults() }}
    />
  );
}

function LocationEmpty() {
  const { openLayer } = useLayer(NEW_LOCATION);
  return (
    <EmptyState
      title="Noch keine Standorte"
      description="Lege einen Platz an, z. B. „Fensterbank“, und ordne ihm eine Lichtzone zu."
      action={{ label: "Ersten Standort anlegen", onClick: () => openLayer() }}
    />
  );
}

/** The notices of the page: the hints as a layer and the reference of the light as a layer (US-QS-19). */
export function Notices({ data }: { data: LightData }) {
  return (
    <div className="flex flex-col gap-2">
      {data.hints.length > 0 && (
        <LayerOpener id={HINTS} className="w-full">
          Hinweise ({data.hints.length})
        </LayerOpener>
      )}
      <LayerOpener id={REFERENCE} className="w-full">
        Lichthunger und Einstufung
      </LayerOpener>
    </div>
  );
}
