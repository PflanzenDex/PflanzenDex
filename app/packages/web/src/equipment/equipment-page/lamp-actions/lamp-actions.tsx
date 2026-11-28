import { useRef } from "react";
import {
  useSay,
  useToast,
  type ToastApi,
} from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { entityKey, useWriteAction } from "../../../shared/data";
import { setEquipmentStatus, setLampZone, type EquipmentStatus } from "../../equipment-api";
import { STATUS_LABELS, SUPPLY_LABELS } from "../../labels";
import { saveWithUndo } from "./save-with-undo";
import {
  linkAgent,
  markChecked,
  setMaintenance,
  setSensorTarget,
  setSupply,
} from "../../upkeep-api";
import type { SensorActions } from "../../overviews/sensors-view/sensors-view";
import { lightWrites } from "./light-writes";
import type { MaintenanceActions } from "../parts/maintenance/maintenance";
import type { SupplyActions } from "../parts/supply/supply";
import { setEquipmentSharing } from "../parts/sharing/sharing-api";
import type { SharingActions } from "../parts/sharing/sharing";

type Token = () => Promise<string | undefined>;

type LampRef = { id: string; name: string };

type Write = ReturnType<typeof useWriteAction>;

/** The writes on a lamp (US-EQU-02): move it to another zone, set its state (with "Rückgängig", US-QS-07). */
function zoneWrites(api: string, write: Write, toast: ToastApi, toasted: Toasted) {
  return {
    busy: write.running,
    onZone: (lamp: LampRef, lightZoneId: string) =>
      void write.run(
        (t, opts) => setLampZone(api, t, { id: lamp.id, lightZoneId }, opts),
        `Lampe „${lamp.name}“ umgezogen.`,
        entityKey("lamp", lamp.id, `zone:${lightZoneId}`),
      ),
    onStatus: (lamp: LampRef & { status: EquipmentStatus }, status: EquipmentStatus) =>
      void toasted(() =>
        saveWithUndo(write, toast, {
          before: lamp.status,
          after: status,
          send: (value) => (t, opts) =>
            setEquipmentStatus(api, t, { id: lamp.id, status: value }, opts),
          scope: (value) => entityKey("lamp", lamp.id, `status:${value}`),
          said: (value) => `Zustand von „${lamp.name}“ ist jetzt „${STATUS_LABELS[value]}“.`,
          saved: `Zustand von „${lamp.name}“ gesichert.`,
          undone: `Zustand von „${lamp.name}“ zurückgesetzt.`,
        }),
      ),
  };
}

/** The writes on the operation of a device (US-EQU-04): the operation data and "checked". */
function maintenanceWrites(api: string, write: Write): MaintenanceActions {
  return {
    busy: write.running,
    onSave: (item, input) =>
      void write.run(
        (t, opts) => setMaintenance(api, t, { id: item.id, input }, opts),
        `Betriebsdaten von „${item.name}“ gesichert.`,
        // Set-state on the operation data (a whole form): the operation only (US-QS-03).
        entityKey("equipment", item.id, "maintenance"),
      ),
    onChecked: (item, checkedOn) =>
      void write.run(
        (t, opts) => markChecked(api, t, { id: item.id, checkedOn }, opts),
        `„${item.name}“ als geprüft vermerkt.`,
        entityKey("equipment", item.id, `checked:${checkedOn}`),
      ),
  };
}

/** The writes on a consumable (US-EQU-05): its supply (with "Rückgängig", US-QS-07) and the link of a plant agent. */
function supplyWrites(api: string, write: Write, toast: ToastApi, toasted: Toasted): SupplyActions {
  return {
    busy: write.running,
    onSupply: (item, supply) => {
      const before = item.supply;
      if (before === null) return;
      void toasted(() =>
        saveWithUndo(write, toast, {
          before,
          after: supply,
          send: (value) => (t, opts) => setSupply(api, t, { id: item.id, supply: value }, opts),
          scope: (value) => entityKey("equipment", item.id, `supply:${value}`),
          said: (value) => `Vorrat von „${item.name}“ ist jetzt „${SUPPLY_LABELS[value]}“.`,
          saved: `Vorrat von „${item.name}“ gesichert.`,
          undone: `Vorrat von „${item.name}“ zurückgesetzt.`,
        }),
      );
    },
    onLink: (item, agentLink) =>
      void write.run(
        (t, opts) => linkAgent(api, t, { id: item.id, agentLink }, opts),
        agentLink === null
          ? `Verknüpfung von „${item.name}“ entfernt.`
          : `„${item.name}“ ist mit „${agentLink}“ verknüpft.`,
        entityKey("equipment", item.id, `link:${agentLink}`),
      ),
  };
}

/**
 * The writes on a sensor (US-EQU-06): where it sits. It says whether the server saved it, for the row's line (F-0160). The
 * write is run `toasted`, that is quiet: the row of the sensor says the result and offers its undo (US-QS-32, SG-FEED-03), and
 * says it to the live region itself, so it is said once (SG-FEED-02). The undo is the same write with the earlier place.
 */
function sensorWrites(api: string, write: Write, toasted: Toasted): SensorActions {
  return {
    busy: write.running,
    onTarget: async (sensor, target) => {
      let saved = false;
      await toasted(() =>
        write.run(
          async (t, opts) => {
            const r = await setSensorTarget(api, t, { id: sensor.id, ...target }, opts);
            saved = r.ok;
            return r;
          },
          `Zuordnung von „${sensor.name}“ gesichert.`,
          // Set-state on the sensor's place: the operation only, the target is the body (US-QS-03).
          entityKey("sensor", sensor.id, "target"),
        ),
      );
      return saved;
    },
  };
}

/** The writes on sharing (US-EQU-12): who may see a piece of equipment. */
function sharingWrites(
  api: string,
  write: Write,
  shared: ReadonlyMap<string, string | null>,
): SharingActions {
  return {
    busy: write.running,
    shared,
    onShare: (item, share, note) =>
      void write.run(
        (t, opts) => setEquipmentSharing(api, t, { id: item.id, share, note }, opts),
        share === "friends"
          ? `„${item.name}“ ist für Freunde sichtbar.`
          : `„${item.name}“ ist wieder privat.`,
        // Set-state with a free-text note: the operation only, the note is the body (US-QS-03).
        entityKey("equipment", item.id, "share"),
      ),
  };
}

/** Runs a change whose undo toast says its result: the live region stays silent for it, so it is heard once. */
type Toasted = (run: () => Promise<void>) => Promise<void>;

/**
 * The writes on a lamp and its device, one state for all of them (P-10). The result of a write is said to the live region,
 * never boxed: it shows at its row or control (SG-FEED-01, SG-FEED-04, F-0160). A refusal is not said: the layer shows it
 * as an alert. The state of a lamp and the supply offer "Rückgängig" in a toast that carries the result until the undo
 * moves into the row (US-QS-32); they are run `toasted`. The place of a sensor offers its undo in its row at once (`SensorsView`,
 * SG-FEED-03); it is run `toasted` too, because the view says its result itself.
 */
export function useLampActions(
  api: string,
  token: Token,
  onWritten: () => void,
  shared: readonly { equipmentId: string; note: string | null }[],
) {
  const say = useSay();
  const quiet = useRef(0);
  const write = useWriteAction(token, onWritten, (message, kind) => {
    if (kind !== "error" && quiet.current === 0) say(message);
  });
  const toast = useToast();
  // A depth, not a flag: a run that ends must not end the silence of another one that is still going.
  const toasted: Toasted = async (run) => {
    quiet.current += 1;
    try {
      await run();
    } finally {
      quiet.current -= 1;
    }
  };
  return {
    actions: zoneWrites(api, write, toast, toasted),
    light: lightWrites(api, write),
    maintenance: maintenanceWrites(api, write),
    supply: supplyWrites(api, write, toast, toasted),
    sensors: sensorWrites(api, write, toasted),
    sharing: sharingWrites(api, write, new Map(shared.map((r) => [r.equipmentId, r.note]))),
    error: write.error,
    failures: write.failures,
  };
}
