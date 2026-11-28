import { useRef } from "react";
import type { SensorView } from "@pflanzendex/core";
import { useUndo } from "@/shared/feedback/undo-row/use-undo";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../equipment.de.json";
import { SensorCard, type Sensor } from "./sensor-card/sensor-card";
import { toTarget, valueOf, type Choice, type SensorTarget } from "./sensor-target";

const ui = texts(table);

export interface SensorActions {
  busy: boolean;
  /** Saves the place of a sensor; resolves with whether the server saved it (a refusal shows at the layer, P-10). */
  onTarget: (
    sensor: { id: string; name: string },
    target: { specimenId: string | null; locationId: string | null },
  ) => Promise<boolean>;
}

/** What the undo of an assignment sets back: the place the sensor had, and the count that replays the highlight. */
interface Before {
  target: SensorTarget;
  n: number;
}

/**
 * The sensors and where each one sits (US-EQU-06): at a specimen, at a location or nowhere. The assignment is optional.
 * The layer that holds this list titles it, so the view renders no heading of its own: the title shows once (issue 2168,
 * SG-BASE-01). No sensor values are shown here; they are not part of equipment (FR-MON-07). The cards take their columns
 * from the width of the section, not the window: beside a 384 px pane the section is narrow and keeps one column
 * (US-QS-15, issue 1640). A saved assignment is shown once, at its card, as "Zugeordnet: <name> · Rückgängig" for the undo
 * window (`SensorCard`, SG-FEED-03); the live region says it (SG-FEED-04) and the line goes with the layer. The undo sets the
 * earlier place back through the same validating operation.
 */
export function SensorsView(props: { view: SensorView; actions: SensorActions }) {
  const { view, actions } = props;
  const undo = useUndo<Before>();
  const announce = useAnnounce();
  const count = useRef(0);
  if (view.sensors.length === 0) return null;
  // The text depends on the choice only: an empty one reads "Nicht mehr zugeordnet", any other "Zugeordnet: <the name the
  // list showed>", so a place the data no longer lists never turns an assignment into a removal (P-10).
  const assign = async (s: Sensor, choice: Choice) => {
    // The place the sensor already has is no change: nothing is sent and nothing is announced.
    if (choice.value === valueOf(s.target)) return;
    const before = toTarget(valueOf(s.target));
    if (!(await actions.onTarget(s, toTarget(choice.value)))) return;
    const text =
      choice.value === "" ? ui("sensors.cleared") : ui("sensors.placed", { name: choice.name });
    count.current += 1;
    const entry = { key: s.id, group: s.id, item: { target: before, n: count.current } };
    // The live region says the saved assignment once, with the sensor's name; the write itself is quiet (`useLampActions`).
    undo.hold([{ ...entry, index: 0, undoable: true }], text, ui("sensors.said", { name: s.name }));
  };
  const revert = async (s: Sensor, before: Before) => {
    undo.release(s.id);
    if (await actions.onTarget(s, before.target))
      announce?.announce(ui("sensors.undone", { name: s.name }));
  };
  return (
    <section className="@container flex min-w-0 flex-col">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @lg:grid-cols-2 @3xl:grid-cols-3">
        {view.sensors.map((s) => {
          const held = undo.held.find((h) => h.key === s.id);
          return (
            <SensorCard
              key={s.id}
              sensor={s}
              view={view}
              busy={actions.busy}
              result={
                held
                  ? { text: held.result, n: held.item.n, onUndo: () => void revert(s, held.item) }
                  : null
              }
              onAssign={(choice) => void assign(s, choice)}
            />
          );
        })}
      </ul>
    </section>
  );
}
