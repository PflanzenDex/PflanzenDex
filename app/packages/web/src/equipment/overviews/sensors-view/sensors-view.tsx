import { useId } from "react";
import type { SensorView } from "@pflanzendex/core";
import { Select } from "@/shared/ui/fields/select/select";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../equipment.de.json";

const t = texts(table);

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
 * The layer that holds this list titles it, so the view renders no heading of its own: the title shows once (issue 2168,
 * SG-BASE-01). No sensor values are shown here; they are not part of equipment (FR-MON-07). The cards take their columns
 * from the width of the section, not the window: beside a 384 px pane the section is narrow and keeps one column
 * (US-QS-15, issue 1640).
 */
export function SensorsView(props: { view: SensorView; actions: SensorActions }) {
  const { view, actions } = props;
  const ids = useId();
  if (view.sensors.length === 0) return null;
  return (
    <section className="@container flex min-w-0 flex-col">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @lg:grid-cols-2 @3xl:grid-cols-3">
        {view.sensors.map((s) => {
          // The select is named by its visible text and the sensor's name (WCAG 2.5.3, issue 1942, F-0158).
          const labelId = `${ids}-${s.id}-label`;
          const nameId = `${ids}-${s.id}-name`;
          return (
            <li
              key={s.id}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
            >
              <span id={nameId} className="break-words font-semibold">
                {s.name}
              </span>
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                <span id={labelId}>{t("sensors.assigned")}</span>
                <Select
                  aria-labelledby={`${labelId} ${nameId}`}
                  value={valueOf(s.target)}
                  disabled={actions.busy}
                  onChange={(e) => actions.onTarget(s, toTarget(e.target.value))}
                >
                  <option value="">{t("sensors.unassigned")}</option>
                  <optgroup label={t("sensors.group.specimens")}>
                    {view.specimens.map((x) => (
                      <option key={x.id} value={`specimen:${x.id}`}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("sensors.group.locations")}>
                    {view.locations.map((x) => (
                      <option key={x.id} value={`location:${x.id}`}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
