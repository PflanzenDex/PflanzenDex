import type { LightZone, ZoneStore } from "../../light";
import type { ZoneStock, ZoneStockSource } from "../../wishlist";
import type { EquipmentRow, EquipmentStatus, EquipmentStore } from "../store/types";
import { zoneLabel } from "../../light";

export interface Lamp {
  readonly id: string;
  readonly name: string;
  readonly status: EquipmentStatus;
}

/** A hint with the next action (P-09). A warning is about a zone that has plants but no working lamp (P-10). */
export interface ZoneNote {
  readonly kind: "no_active_lamp" | "unused_capacity";
  readonly text: string;
  readonly nextAction: string;
}

export interface ZoneEquipment {
  readonly zoneId: string;
  readonly name: string;
  /** Active specimens of zones 2 to 4; `null` where the app does not count (the cutting light): unknown, P-08. */
  readonly specimens: number | null;
  readonly lamps: readonly Lamp[];
  readonly note: ZoneNote | null;
}

export interface ZoneEquipmentView {
  readonly zones: readonly ZoneEquipment[];
  /** Lamps recorded without a zone (before zones were required): they serve no zone yet. */
  readonly unassigned: readonly Lamp[];
}

export interface ZoneEquipmentDependencies {
  readonly equipment: Pick<EquipmentStore, "list">;
  readonly zones: Pick<ZoneStore, "list">;
  readonly stock: Pick<ZoneStockSource, "stock">;
}

const plants = (n: number): string => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

const lampOf = (e: EquipmentRow): Lamp => ({
  id: e.id,
  name: e.name,
  status: e.status ?? "active",
});

function noteFor(zone: LightZone, count: number | null, lamps: readonly Lamp[]): ZoneNote | null {
  if (count === null) return null;
  const active = lamps.some((l) => l.status === "active");
  if (count > 0 && !active)
    return {
      kind: "no_active_lamp",
      text: `Die Lichtzone ${zoneLabel(zone.name)} hat ${plants(count)}, aber keine aktive Lampe.`,
      nextAction: "Ordne dieser Zone eine aktive Lampe zu oder erfasse eine neue Lampe.",
    };
  if (count === 0 && active)
    return {
      kind: "unused_capacity",
      text: `Die Lampe der Lichtzone ${zoneLabel(zone.name)} leuchtet für keine Pflanze.`,
      nextAction:
        "Hier ist Platz: Setze eine Pflanze unter diese Lampe oder wünsche dir eine dafür.",
    };
  return null;
}

/**
 * The devices per light zone (US-EQU-02), purely derived on every request (P-01): the lamps of each zone with their
 * state, a warning for a zone 2 to 4 that has specimens but no active lamp, a hint (no error) for an active lamp over
 * an empty zone. The distribution of the specimens (US-LIC-02) is not changed; the equipment only extends it.
 */
export async function zoneEquipment(
  deps: ZoneEquipmentDependencies,
  userId: string,
): Promise<ZoneEquipmentView> {
  const [zones, stock, items] = await Promise.all([
    deps.zones.list(userId),
    deps.stock.stock(userId),
    deps.equipment.list(userId),
  ]);
  const counts = new Map<string, number>(stock.map((s: ZoneStock) => [s.zoneId, s.count]));
  const lamps = items.filter((e) => e.type === "Lamp");
  return {
    zones: zones.map((zone) => {
      const own = lamps.filter((e) => e.lightZoneId === zone.id).map(lampOf);
      const count = counts.get(zone.id) ?? null;
      return {
        zoneId: zone.id,
        name: zone.name,
        specimens: count,
        lamps: own,
        note: noteFor(zone, count, own),
      };
    }),
    unassigned: lamps.filter((e) => e.lightZoneId === null).map(lampOf),
  };
}
