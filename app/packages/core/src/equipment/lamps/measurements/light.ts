import type { LightZone, ZoneStore } from "../../../light";
import type { EquipmentStatus, EquipmentStore } from "../../store/types";
import type { DeviationLimitStore, LampMeasurement, LampMeasurementStore } from "./types";

/** "Check zone" (US-EQU-03): the last measurement deviates from the zone ceiling by more than the keeper's limit. */
export interface ZoneCheck {
  readonly deviationPercent: number;
  readonly text: string;
  readonly nextAction: string;
}

export interface LampLight {
  readonly id: string;
  readonly name: string;
  readonly status: EquipmentStatus;
  readonly zone: { readonly id: string; readonly name: string; readonly luxCeiling: number } | null;
  readonly powerW: number | null;
  /** The manufacturer's statement in lux; `null` = unknown. */
  readonly manufacturerLux: number | null;
  /** The latest measurement; `null` = "not measured". */
  readonly last: LampMeasurement | null;
  /** All measurements, newest first. */
  readonly measurements: readonly LampMeasurement[];
  /** What applies: the measured value, else the ceiling of the zone marked as not measured (FR-LIC-06). */
  readonly effective: { readonly lux: number; readonly basis: "measured" | "zone" } | null;
  readonly check: ZoneCheck | null;
}

export interface LampLightView {
  /** The deviation limit in percent; `null` = not set by the keeper. */
  readonly limit: number | null;
  readonly lamps: readonly LampLight[];
}

export interface LampLightDependencies {
  readonly equipment: Pick<EquipmentStore, "list">;
  readonly zones: Pick<ZoneStore, "list">;
  readonly measurements: Pick<LampMeasurementStore, "list">;
  readonly limits: Pick<DeviationLimitStore, "limit">;
}

const lux = (n: number): string => `${n.toLocaleString("de-DE")} lx`;

function checkOf(
  last: LampMeasurement | null,
  zone: LightZone | undefined,
  limit: number | null,
): ZoneCheck | null {
  if (!last || !zone || limit === null) return null;
  const deviation = Math.round((Math.abs(last.lux - zone.luxCeiling) / zone.luxCeiling) * 100);
  if (deviation <= limit) return null;
  return {
    deviationPercent: deviation,
    text: `Die letzte Messung (${lux(last.lux)} am ${last.measuredOn}) weicht um ${deviation} % von der Obergrenze der Zone ${zone.name} (${lux(zone.luxCeiling)}) ab.`,
    nextAction: "Prüfe die Zone: Miss nach oder ordne die Lampe der passenden Zone zu.",
  };
}

/**
 * The light intensity per lamp (US-EQU-03, FR-LIC-06), purely derived on every request (P-01): the manufacturer's
 * statement and the latest measurement side by side, never mixed. Without a measurement the ceiling of the zone applies,
 * marked as not measured. "Check zone" appears only when the keeper has set a limit (no invented threshold, P-08) and
 * the latest measurement deviates from the zone ceiling by more than that share, below or above.
 */
export async function lampLight(
  deps: LampLightDependencies,
  userId: string,
): Promise<LampLightView> {
  const [items, zones, measured, limit] = await Promise.all([
    deps.equipment.list(userId),
    deps.zones.list(userId),
    deps.measurements.list(userId),
    deps.limits.limit(userId),
  ]);
  const lamps = items
    .filter((e) => e.type === "Lamp")
    .map((e) => {
      const zone = zones.find((z) => z.id === e.lightZoneId);
      const own = measured.filter((m) => m.equipmentId === e.id);
      const last = own[0] ?? null;
      return {
        id: e.id,
        name: e.name,
        status: e.status ?? "active",
        zone: zone ? { id: zone.id, name: zone.name, luxCeiling: zone.luxCeiling } : null,
        powerW: e.powerW,
        manufacturerLux: e.luxStatement,
        last,
        measurements: own,
        effective: last
          ? { lux: last.lux, basis: "measured" as const }
          : zone
            ? { lux: zone.luxCeiling, basis: "zone" as const }
            : null,
        check: checkOf(last, zone, limit),
      };
    });
  return { limit, lamps };
}
