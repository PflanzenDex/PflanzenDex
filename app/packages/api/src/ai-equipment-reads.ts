import {
  equipmentChecksDue,
  equipmentNeeds,
  equipmentWishes,
  lampLight,
  localToday,
  ok,
  plantAgents,
  sensorAssignments,
  zoneEquipment,
  type AreaReadSource,
} from "@pflanzendex/core";
import {
  DeviationLimitPostgres,
  EquipmentPostgres,
  EquipmentWishesPostgres,
  LampMeasurementsPostgres,
  LocationPostgres,
  SpecimenPostgres,
  WishesPostgres,
  ZonePostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import type { AreaReadOptions } from "./ai-care-reads";

type EquipmentAreas =
  | "list_equipment"
  | "list_equipment_lamps"
  | "list_equipment_sensors"
  | "list_equipment_agents"
  | "list_equipment_zones"
  | "list_equipment_needs"
  | "list_equipment_checks_due"
  | "list_equipment_wishes"
  | "list_bought_equipment_wishes"
  | "list_discarded_equipment_wishes";

/**
 * Equipment for the AI client (US-KI-12, KI-R10): the same functions and stores as the app's own routes `GET /equipment`,
 * `/equipment/lamps`, `/equipment/sensors`, `/equipment/agents`, `/equipment/zones`, `/equipment/needs`,
 * `/equipment/checks-due` and `/equipment/wishes` (FR-KI-14). Only the own equipment (P-04); what friends share, the
 * sharing settings and the product suggestions stay unreachable (FR-KI-10, `NOT_RELEASED_TOOLS`).
 */
export function equipmentAreaReadsFor(
  pool: Pool,
  opt: AreaReadOptions,
): Pick<AreaReadSource, EquipmentAreas> {
  const equipment = new EquipmentPostgres(pool);
  const zones = new ZonePostgres(pool);
  const measurements = new LampMeasurementsPostgres(pool);
  const limits = new DeviationLimitPostgres(pool);
  const locations = new LocationPostgres(pool);
  const specimens = new SpecimenPostgres(pool);
  const needs = { equipment, zones, stock: opt.zoneStock, wishes: new WishesPostgres(pool) };
  const wishes = new EquipmentWishesPostgres(pool);
  return {
    list_equipment: async (u) => ok({ equipment: await equipment.list(u) }),
    // The keeper's deviation limit is `limit` in the app's answer; here paging owns `limit` (FR-KI-16).
    list_equipment_lamps: async (u) => {
      const { lamps, limit } = await lampLight({ equipment, zones, measurements, limits }, u);
      return ok({ lamps, deviationLimit: limit });
    },
    list_equipment_sensors: async (u) =>
      ok(await sensorAssignments({ equipment, specimens, locations }, u)),
    list_equipment_agents: async (u) => ok({ agents: await plantAgents({ equipment }, u) }),
    list_equipment_zones: async (u) =>
      ok(await zoneEquipment({ equipment, zones, stock: opt.zoneStock }, u)),
    list_equipment_needs: async (u) => ok({ needs: await equipmentNeeds(needs, u) }),
    list_equipment_checks_due: async (u, q) => {
      const today = localToday(opt.clock(), q.timeZone ?? "UTC");
      return ok({ due: await equipmentChecksDue({ equipment, measurements }, u, today) });
    },
    // One app answer, three paged tools like the plant wishes (FR-KI-16).
    list_equipment_wishes: async (u) => ok({ open: (await equipmentWishes({ wishes }, u)).open }),
    list_bought_equipment_wishes: async (u) =>
      ok({ bought: (await equipmentWishes({ wishes }, u)).bought }),
    list_discarded_equipment_wishes: async (u) =>
      ok({ discarded: (await equipmentWishes({ wishes }, u)).discarded }),
  };
}
