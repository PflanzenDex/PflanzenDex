import { isActive, type SpecimenRow } from "../../collection";
import type { LightLocationStore } from "../../light";
import type { EquipmentStatus, EquipmentStore } from "../store/types";

/** Where a sensor sits; `null` = not assigned. */
export interface SensorAssignment {
  readonly kind: "specimen" | "location";
  readonly id: string;
  readonly name: string;
}

export interface SensorView {
  readonly sensors: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: EquipmentStatus;
    readonly target: SensorAssignment | null;
  }[];
  /** What a sensor can be assigned to: the active specimens and the locations of the account, by name. */
  readonly specimens: readonly { readonly id: string; readonly name: string }[];
  readonly locations: readonly { readonly id: string; readonly name: string }[];
}

export interface SensorAssignmentsDependencies {
  readonly equipment: Pick<EquipmentStore, "list">;
  readonly specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
  readonly locations: Pick<LightLocationStore, "list">;
}

const byName = <T extends { name: string; id: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id);

/**
 * The sensors with the specimen or location each one sits at (US-EQU-06), purely derived (P-01), and the choices for an
 * assignment. A target that is archived or gone reads as not assigned instead of a dangling name (P-10 stays visible:
 * the sensor is listed, the assignment is open). No sensor values are shown (FR-MON-07).
 */
export async function sensorAssignments(
  deps: SensorAssignmentsDependencies,
  userId: string,
): Promise<SensorView> {
  const [items, specimens, locations] = await Promise.all([
    deps.equipment.list(userId),
    deps.specimens.list(userId),
    deps.locations.list(userId),
  ]);
  const active = specimens.filter(isActive).map((s) => ({ id: s.id, name: s.name }));
  const places = locations.map((l) => ({ id: l.id, name: l.name }));
  const target = (
    specimenId: string | null,
    locationId: string | null,
  ): SensorAssignment | null => {
    const s = active.find((x) => x.id === specimenId);
    if (s) return { kind: "specimen", ...s };
    const l = places.find((x) => x.id === locationId);
    return l ? { kind: "location", ...l } : null;
  };
  return {
    sensors: items
      .filter((e) => e.type === "Sensor")
      .map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status ?? "active",
        target: target(e.assignedSpecimenId, e.assignedLocationId),
      }))
      .sort(byName),
    specimens: [...active].sort(byName),
    locations: [...places].sort(byName),
  };
}
