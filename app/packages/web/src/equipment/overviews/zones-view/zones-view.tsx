import type { Lamp, ZoneEquipment, ZoneEquipmentView } from "@pflanzendex/core";
import { EQUIPMENT_STATUSES, zoneLabel } from "@pflanzendex/core";
import { Select } from "@/components/ui/fields/select/select";
import { STATUS_LABELS } from "../../labels";
import type { EquipmentStatus } from "../../equipment-api";

export interface LampActions {
  onZone: (lamp: Lamp, lightZoneId: string) => void;
  onStatus: (lamp: Lamp, status: EquipmentStatus) => void;
  busy: boolean;
}

function LampRow(props: {
  lamp: Lamp;
  zoneId: string;
  zones: readonly ZoneEquipment[];
  actions: LampActions;
}) {
  const { lamp, zoneId, zones, actions } = props;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
      <span className="break-words font-semibold">{lamp.name}</span>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Zustand
          <Select
            value={lamp.status}
            disabled={actions.busy}
            onChange={(e) => actions.onStatus(lamp, e.target.value as EquipmentStatus)}
          >
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Lichtzone
          <Select
            value={zoneId}
            disabled={actions.busy}
            onChange={(e) => e.target.value && actions.onZone(lamp, e.target.value)}
          >
            {zoneId === "" ? <option value="">ohne Zone</option> : null}
            {zones.map((z) => (
              <option key={z.zoneId} value={z.zoneId}>
                {zoneLabel(z.name)}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </li>
  );
}

const plants = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

function ZoneCard(props: {
  zone: ZoneEquipment;
  all: readonly ZoneEquipment[];
  actions: LampActions;
}) {
  const { zone, all, actions } = props;
  const warning = zone.note?.kind === "no_active_lamp";
  return (
    <li className="min-w-0 rounded-lg border border-border p-3">
      <h3 className="font-semibold">{zoneLabel(zone.name)}</h3>
      <p className="text-sm text-muted-foreground">
        {zone.specimens === null ? "Pflanzenzahl unbekannt" : plants(zone.specimens)}
      </p>
      {zone.note ? (
        <p
          role={warning ? "alert" : "status"}
          className={
            warning
              ? "my-2 rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground"
              : "my-2 rounded-lg border border-border p-3"
          }
        >
          {zone.note.text} <strong>{zone.note.nextAction}</strong>
        </p>
      ) : null}
      {zone.lamps.length === 0 ? (
        <p className="text-sm">Noch keine Lampe in dieser Zone.</p>
      ) : (
        <ul
          className="m-0 mt-2 flex list-none flex-col gap-2 p-0"
          aria-label={`Lampen in ${zoneLabel(zone.name)}`}
        >
          {zone.lamps.map((l) => (
            <LampRow key={l.id} lamp={l} zoneId={zone.zoneId} zones={all} actions={actions} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The lamps per light zone (US-EQU-02): state and zone can be changed here; a zone with specimens but no active lamp
 * is warned about (P-10), an active lamp over an empty zone is only a hint. Nothing is guessed for zones the app does
 * not count (P-08).
 */
export function ZonesView(props: { view: ZoneEquipmentView; actions: LampActions }) {
  const { view, actions } = props;
  if (view.zones.length === 0 && view.unassigned.length === 0) return null;
  return (
    <section aria-labelledby="equipment-zones-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="equipment-zones-title" className="text-xl font-semibold">
        Lampen je Lichtzone
      </h2>
      {view.unassigned.length > 0 ? (
        <div className="rounded-lg border border-warning-border bg-warning p-3 text-warning-foreground">
          <p>Diese Lampen haben noch keine Lichtzone. Ordne jeder eine Zone zu.</p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0 text-foreground">
            {view.unassigned.map((l) => (
              <LampRow key={l.id} lamp={l} zoneId="" zones={view.zones} actions={actions} />
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {view.zones.map((z) => (
          <ZoneCard key={z.zoneId} zone={z} all={view.zones} actions={actions} />
        ))}
      </ul>
    </section>
  );
}
