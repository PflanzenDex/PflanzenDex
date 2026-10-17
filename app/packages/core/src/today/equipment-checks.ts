// "Check due" of a device (US-EQU-04) in the today list. The derivation lives in `equipment`; this file only turns it
// into items with a next action (P-09). Read only, nothing is stored (P-01).
import { equipmentChecksDue, type ChecksDueDependencies } from "../equipment";
import type { TodayItem } from "./today-types";

export interface EquipmentCheckDependencies {
  readonly equipment: ChecksDueDependencies["equipment"];
  /** The measurement log of the lamps; the last measurement of a lamp counts as its last check. */
  readonly lampMeasurements: ChecksDueDependencies["measurements"];
}

/** `YYYY-MM-DD` as German date `DD.MM.YYYY`; the calendar date stays as stored (NFR-08). */
const germanDate = (date: string) => date.split("-").reverse().join(".");

/** Active devices whose check interval, set by the keeper, has run out; no interval means no item. */
export async function equipmentCheckItems(
  deps: EquipmentCheckDependencies,
  userId: string,
  today: string,
): Promise<TodayItem[]> {
  const due = await equipmentChecksDue(
    { equipment: deps.equipment, measurements: deps.lampMeasurements },
    userId,
    today,
  );
  return due.map((d) => ({
    id: `equipment-check:${d.id}`,
    kind: "equipment_check_due",
    specimenId: null,
    specimenName: null,
    text: `Prüfung fällig: ${d.name} – ${
      d.lastCheckedOn === null
        ? "noch nie geprüft."
        : `zuletzt geprüft am ${germanDate(d.lastCheckedOn)}.`
    }`,
    nextAction: "Prüfe das Gerät und bestätige es im Equipment mit „Jetzt geprüft“.",
    target: "equipment",
  }));
}
