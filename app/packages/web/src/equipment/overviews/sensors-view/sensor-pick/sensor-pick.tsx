import { useState, type RefObject } from "react";
import type { SensorView } from "@pflanzendex/core";
import {
  ResponsiveModal,
  focusModalTitle,
} from "@/shared/patterns/responsive/responsive-modal/responsive-modal";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../../equipment.de.json";
import type { Choice } from "../sensor-target";
import { PickBody } from "./pick-body/pick-body";

const ui = texts(table);

/**
 * The pick list of a sensor assignment (Q-108, US-QS-32): a sheet below 768 px and a dialog from it (`ResponsiveModal`, DS-23).
 * The search field comes first and takes the focus, then "Nicht zugeordnet", then the sections "Pflanzen" and "Standorte"; the
 * current choice is marked. A pick closes the list and returns the focus to the row that opened it (`returnFocusTo`); the
 * caller saves it. The list renders while it is open and until its sheet has left the page, so it does not collapse while it
 * slides out; each opening starts with an empty search.
 */
export function SensorPick(props: {
  sensorName: string;
  view: Pick<SensorView, "specimens" | "locations">;
  /** The current choice as `specimen:<id>`, `location:<id>` or empty. */
  current: string;
  open: boolean;
  /** A write runs: the entries are `aria-disabled` and a pick does nothing. */
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (choice: Choice) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const [kept, setKept] = useState(false);
  if (props.open && !kept) setKept(true);
  return (
    <ResponsiveModal
      title={ui("sensors.pickTitle", { name: props.sensorName })}
      open={props.open}
      onOpenChange={props.onOpenChange}
      onOpenAutoFocus={focusModalTitle}
      onExited={() => setKept(false)}
      returnFocusTo={props.returnFocusTo}
      halfHeight
    >
      {props.open || kept ? (
        <PickBody
          view={props.view}
          current={props.current}
          busy={props.busy}
          onPick={props.onPick}
        />
      ) : null}
    </ResponsiveModal>
  );
}
