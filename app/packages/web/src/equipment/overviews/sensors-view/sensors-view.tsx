import { useId, useState } from "react";
import type { SensorView } from "@pflanzendex/core";
import { Select } from "@/shared/ui/select";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../equipment.de.json";

const ui = texts(table);

export interface SensorActions {
  busy: boolean;
  /** Saves the place of a sensor; resolves with whether the server saved it (a refusal shows at the layer, P-10). */
  onTarget: (
    sensor: { id: string; name: string },
    target: { specimenId: string | null; locationId: string | null },
  ) => Promise<boolean>;
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

type Sensor = SensorView["sensors"][number];

/**
 * One sensor: its name, the choice of its place and the line of its result. The line keeps the height of one text line, so a
 * saved assignment moves nothing, and it is highlighted briefly (SG-FEED-01, SG-MOTION-07, F-0160); `n` replays the
 * highlight for a repeated result. While a write runs the choice is `aria-disabled`, not `disabled`, and a change is
 * ignored: a disabled select loses the focus to the sheet (F-0094, issue 2463, SG-BASE-01).
 */
function SensorCard(props: {
  sensor: Sensor;
  view: SensorView;
  busy: boolean;
  result: { text: string; n: number } | null;
  onAssign: (value: string, label: string) => void;
}) {
  const { sensor: s, view, result } = props;
  const ids = useId();
  // The select is named by its visible text and the sensor's name (WCAG 2.5.3, issue 1942, F-0158).
  const labelId = `${ids}-label`;
  const nameId = `${ids}-name`;
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
      <span id={nameId} className="break-words font-semibold">
        {s.name}
      </span>
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span id={labelId}>{ui("sensors.assign")}</span>
        <Select
          aria-labelledby={`${labelId} ${nameId}`}
          value={valueOf(s.target)}
          aria-disabled={props.busy || undefined}
          className={BUSY_LOOK}
          onChange={(e) => {
            if (props.busy) return;
            props.onAssign(e.target.value, e.target.selectedOptions[0]?.textContent ?? "");
          }}
        >
          <option value="">{ui("sensors.unassigned")}</option>
          <optgroup label={ui("sensors.groupPlants")}>
            {view.specimens.map((x) => (
              <option key={x.id} value={`specimen:${x.id}`}>
                {x.name}
              </option>
            ))}
          </optgroup>
          <optgroup label={ui("sensors.groupLocations")}>
            {view.locations.map((x) => (
              <option key={x.id} value={`location:${x.id}`}>
                {x.name}
              </option>
            ))}
          </optgroup>
        </Select>
      </label>
      <p key={result?.n ?? 0} className={cn("min-h-[1lh] text-sm", result && "animate-changed")}>
        {result?.text}
      </p>
    </li>
  );
}

/**
 * The sensors and where each one sits (US-EQU-06): at a specimen, at a location or nowhere. The assignment is optional.
 * The layer that holds this list titles it, so the view renders no heading of its own: the title shows once (issue 2168,
 * SG-BASE-01). No sensor values are shown here; they are not part of equipment (FR-MON-07). The cards take their columns
 * from the width of the section, not the window: beside a 384 px pane the section is narrow and keeps one column
 * (US-QS-15, issue 1640). A saved assignment is shown once, at its card (`SensorCard`); the live region says it
 * (SG-FEED-04) and the line goes with the layer.
 */
export function SensorsView(props: { view: SensorView; actions: SensorActions }) {
  const { view, actions } = props;
  // The card whose assignment was just saved, its text and a count that replays the highlight for a repeated result.
  const [placed, setPlaced] = useState<{ id: string; text: string; n: number } | null>(null);
  if (view.sensors.length === 0) return null;
  // The text depends on the choice only: an empty one reads "Nicht mehr zugeordnet", any other "Zugeordnet: <the label the
  // choice showed>", so a list that changed under the open choice never turns an assignment into a removal (P-10).
  const assign = async (s: Sensor, value: string, label: string) => {
    const target = toTarget(value);
    if (!(await actions.onTarget(s, target))) return;
    const cleared = target.specimenId === null && target.locationId === null;
    const named =
      label === "" ? ui("sensors.placedNameless") : ui("sensors.placed", { name: label });
    const text = cleared ? ui("sensors.cleared") : named;
    setPlaced((last) => ({ id: s.id, text, n: (last?.n ?? 0) + 1 }));
  };
  return (
    <section className="@container flex min-w-0 flex-col">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @lg:grid-cols-2 @3xl:grid-cols-3">
        {view.sensors.map((s) => (
          <SensorCard
            key={s.id}
            sensor={s}
            view={view}
            busy={actions.busy}
            result={placed?.id === s.id ? placed : null}
            onAssign={(value, label) => void assign(s, value, label)}
          />
        ))}
      </ul>
    </section>
  );
}
