import { useId, useRef, useState } from "react";
import type { SensorView } from "@pflanzendex/core";
import { OpenRow } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part.row";
import { UndoRow } from "@/shared/feedback/undo-row/undo-row";
import { BUSY_LOOK, cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../equipment.de.json";
import { SensorPick } from "../sensor-pick/sensor-pick";
import { valueOf, type Choice } from "../sensor-target";

const ui = texts(table);

export type Sensor = SensorView["sensors"][number];

/** The result of the last assignment of a sensor: its text, a count that replays the highlight and the undo. */
export interface SensorResult {
  text: string;
  n: number;
  onUndo: () => void;
}

/**
 * The line under the row: it keeps the height of one text line at rest, so a saved assignment moves nothing, and it is
 * highlighted briefly (SG-FEED-01, SG-MOTION-07, F-0160); `n` replays the highlight for a repeated result. The result stays
 * with its undo for the undo window (SG-FEED-03); the undo never takes the focus from the row (`keepFocus`, issue 2536).
 */
function ResultLine(props: { sensor: Sensor; result: SensorResult | null; busy: boolean }) {
  const { result } = props;
  return (
    <div key={result?.n ?? 0} className={cn("min-h-[1lh] text-sm", result && "animate-changed")}>
      {result && (
        <UndoRow
          result={result.text}
          subject={ui("sensors.undoSubject", { name: props.sensor.name })}
          onUndo={result.onUndo}
          busy={props.busy}
          keepFocus
          compact
        />
      )}
    </div>
  );
}

/**
 * One sensor: its name, the row of its place and the line of its result. The row names the place in its meta line, which
 * wraps and is never cut (SG-TYPE-05, Q-108), and opens the pick list. Its name is its visible text, "Zugeordnet zu" and the
 * place, and then the sensor's name, which tells two rows apart (WCAG 2.5.3, issue 1942, F-0158). While a write runs the row is
 * `aria-disabled`, not `disabled`, and a tap is ignored: a disabled control loses the focus to the sheet (F-0094, issue 2463,
 * SG-BASE-01). The result of the last assignment shows under the row (`ResultLine`).
 */
export function SensorCard(props: {
  sensor: Sensor;
  view: SensorView;
  busy: boolean;
  result: SensorResult | null;
  onAssign: (choice: Choice) => void;
}) {
  const { sensor: s, result } = props;
  const ids = useId();
  const titleId = `${ids}-title`;
  const valueId = `${ids}-value`;
  const nameId = `${ids}-name`;
  const row = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
      <span id={nameId} className="break-words font-semibold">
        {s.name}
      </span>
      <OpenRow
        ref={row}
        title={ui("sensors.assign")}
        titleId={titleId}
        value={s.target?.name ?? ui("sensors.unassigned")}
        valueId={valueId}
        aria-labelledby={`${titleId} ${valueId} ${nameId}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={props.busy || undefined}
        // The card has the border and the padding: the row inside takes the whole width, so a long name keeps its room (200 % text).
        className={cn(BUSY_LOOK, "border-0 px-0")}
        onClick={() => {
          if (!props.busy) setOpen(true);
        }}
      />
      <SensorPick
        sensorName={s.name}
        view={props.view}
        current={valueOf(s.target)}
        open={open}
        busy={props.busy}
        onOpenChange={setOpen}
        onPick={(choice) => {
          setOpen(false);
          props.onAssign(choice);
        }}
        returnFocusTo={row}
      />
      <ResultLine sensor={s} result={result} busy={props.busy} />
    </li>
  );
}
