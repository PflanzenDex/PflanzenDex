import { errorText } from "@/lib/error-text";
import {
  useToast,
  type ToastApi,
} from "@/components/shared/states/toast/toast-provider/toast-provider";
import { useWriteAction } from "../../../kernel";
import {
  describeLamp,
  measureLamp,
  setDeviationLimit,
  setEquipmentStatus,
  setLampZone,
  type EquipmentStatus,
} from "../../equipment-api";
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
import type { LampLightActions } from "../../lamp-light/lamp-light";
import type { MaintenanceActions } from "../parts/maintenance/maintenance";
import type { SupplyActions } from "../parts/supply/supply";
import { setEquipmentSharing } from "../parts/sharing/sharing-api";
import type { SharingActions } from "../parts/sharing/sharing";

type Token = () => Promise<string | undefined>;

type LampRef = { id: string; name: string };

type Write = ReturnType<typeof useWriteAction>;

/** The writes on a lamp (US-EQU-02): move it to another zone, set its state (with "Rückgängig", US-QS-07). */
function zoneWrites(api: string, write: Write, toast: ToastApi) {
  return {
    busy: write.running,
    onZone: (lamp: LampRef, lightZoneId: string) =>
      void write.run(
        (t) => setLampZone(api, t, { id: lamp.id, lightZoneId }),
        `Lampe „${lamp.name}“ umgezogen.`,
      ),
    onStatus: (lamp: LampRef & { status: EquipmentStatus }, status: EquipmentStatus) =>
      void saveWithUndo(write, toast, {
        before: lamp.status,
        after: status,
        send: (value) => (t) => setEquipmentStatus(api, t, { id: lamp.id, status: value }),
        said: (value) => `Zustand von „${lamp.name}“ ist jetzt „${STATUS_LABELS[value]}“.`,
        saved: `Zustand von „${lamp.name}“ gespeichert.`,
        undone: `Zustand von „${lamp.name}“ zurückgesetzt.`,
      }),
  };
}

/** The writes on the light intensity (US-EQU-03): a measurement, the manufacturer's statement, the limit. */
function lightWrites(api: string, write: Write): LampLightActions {
  return {
    busy: write.running,
    onMeasure: async (lamp, input) => {
      let saved = false;
      await write.run(async (t) => {
        const r = await measureLamp(api, t, { id: lamp.id, input });
        saved = r.ok;
        return r;
      }, `Messung für „${lamp.name}“ gespeichert.`);
      return saved;
    },
    onData: (lamp, data) =>
      void write.run(
        (t) => describeLamp(api, t, { id: lamp.id, ...data }),
        `Herstellerangabe für „${lamp.name}“ gespeichert.`,
      ),
    onLimit: (percent) =>
      void write.run(
        (t) => setDeviationLimit(api, t, percent),
        percent === null ? "Die Prüfung ist aus." : `Grenze von ${percent} % gespeichert.`,
      ),
  };
}

/** The writes on the operation of a device (US-EQU-04): the operation data and "checked". */
function maintenanceWrites(api: string, write: Write): MaintenanceActions {
  return {
    busy: write.running,
    onSave: (item, input) =>
      void write.run(
        (t) => setMaintenance(api, t, { id: item.id, input }),
        `Betriebsdaten von „${item.name}“ gespeichert.`,
      ),
    onChecked: (item, checkedOn) =>
      void write.run(
        (t) => markChecked(api, t, { id: item.id, checkedOn }),
        `„${item.name}“ als geprüft vermerkt.`,
      ),
  };
}

/** The writes on a consumable (US-EQU-05): its supply (with "Rückgängig", US-QS-07) and the link of a plant agent. */
function supplyWrites(api: string, write: Write, toast: ToastApi): SupplyActions {
  return {
    busy: write.running,
    onSupply: (item, supply) => {
      if (item.supply === null) return;
      void saveWithUndo(write, toast, {
        before: item.supply,
        after: supply,
        send: (value) => (t) => setSupply(api, t, { id: item.id, supply: value }),
        said: (value) => `Vorrat von „${item.name}“ ist jetzt „${SUPPLY_LABELS[value]}“.`,
        saved: `Vorrat von „${item.name}“ gespeichert.`,
        undone: `Vorrat von „${item.name}“ zurückgesetzt.`,
      });
    },
    onLink: (item, agentLink) =>
      void write.run(
        (t) => linkAgent(api, t, { id: item.id, agentLink }),
        agentLink === null
          ? `Verknüpfung von „${item.name}“ entfernt.`
          : `„${item.name}“ ist mit „${agentLink}“ verknüpft.`,
      ),
  };
}

/** The writes on a sensor (US-EQU-06): where it sits. */
function sensorWrites(api: string, write: Write): SensorActions {
  return {
    busy: write.running,
    onTarget: (sensor, target) =>
      void write.run(
        (t) => setSensorTarget(api, t, { id: sensor.id, ...target }),
        `Zuordnung von „${sensor.name}“ gespeichert.`,
      ),
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
        (t) => setEquipmentSharing(api, t, { id: item.id, share, note }),
        share === "friends"
          ? `„${item.name}“ ist für Freunde sichtbar.`
          : `„${item.name}“ ist wieder privat.`,
      ),
  };
}

/** One write state for everything on a lamp, so the answer shown above the zones is always the latest (P-10). */
export function useLampActions(
  api: string,
  token: Token,
  onWritten: () => void,
  shared: readonly { equipmentId: string; note: string | null }[],
) {
  const write = useWriteAction(token, onWritten);
  const toast = useToast();
  return {
    actions: zoneWrites(api, write, toast),
    light: lightWrites(api, write),
    maintenance: maintenanceWrites(api, write),
    supply: supplyWrites(api, write, toast),
    sensors: sensorWrites(api, write),
    sharing: sharingWrites(api, write, new Map(shared.map((r) => [r.equipmentId, r.note]))),
    message: write.message,
    error: write.error,
  };
}

export function LampOutcome(props: { message: string | null; error: { code: string } | null }) {
  if (props.error)
    return (
      <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">
        {errorText(props.error.code)}
      </p>
    );
  return props.message ? (
    <p role="status" className="rounded-lg border border-border p-3">
      {props.message}
    </p>
  ) : null;
}
