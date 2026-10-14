import type { SensorView } from "@pflanzendex/core";
import { Select } from "@/components/ui/fields/select/select";

export interface SensorActions {
  busy: boolean;
  onTarget: (
    sensor: { id: string; name: string },
    target: { specimenId: string | null; locationId: string | null },
  ) => void;
}

/** The choice as one text: `specimen:<id>`, `location:<id>` or empty for none. */
const valueOf = (t: SensorView["sensors"][number]["target"]): string =>
  t ? `${t.kind}:${t.id}` : "";

const toTarget = (value: string): { specimenId: string | null; locationId: string | null } => {
  const [kind, id] = value.split(":");
  return {
    specimenId: kind === "specimen" && id ? id : null,
    locationId: kind === "location" && id ? id : null,
  };
};

/**
 * The sensors and where each one sits (US-EQU-06): at a specimen, at a location or nowhere. The assignment is optional.
 * No sensor values are shown here; they are not part of equipment (FR-MON-07).
 */
export function SensorsView(props: { view: SensorView; actions: SensorActions }) {
  const { view, actions } = props;
  if (view.sensors.length === 0) return null;
  return (
    <section aria-labelledby="equipment-sensors-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="equipment-sensors-title" className="text-xl font-semibold">
        Sensoren
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {view.sensors.map((s) => (
          <li
            key={s.id}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
          >
            <span className="break-words font-semibold">{s.name}</span>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              Zugeordnet zu
              <Select
                aria-label={`Zuordnung von ${s.name}`}
                value={valueOf(s.target)}
                disabled={actions.busy}
                onChange={(e) => actions.onTarget(s, toTarget(e.target.value))}
              >
                <option value="">Keinem (nicht zugeordnet)</option>
                <optgroup label="Exemplare">
                  {view.specimens.map((x) => (
                    <option key={x.id} value={`specimen:${x.id}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Standorte">
                  {view.locations.map((x) => (
                    <option key={x.id} value={`location:${x.id}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
