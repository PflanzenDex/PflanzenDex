// Tools over the keeper's own equipment (US-KI-12, EQU): every kind, lamps, sensors, plant agents, devices per light
// zone, needs, checks due and equipment wishes. Each is a thin adapter over its route in AREA_PATHS, built like the other
// area tools. Equipment friends share, the sharing settings and product suggestions are never released (FR-KI-10): their
// names are in ../../not-released-tools.ts and answer `ai.not_released`.
import type { McpTool } from "../../schema";
import { area } from "./area-tools";

export const EQUIPMENT_TOOLS: readonly McpTool[] = [
  area(
    "list_equipment",
    "My equipment",
    "Every piece of equipment the keeper recorded (lamps, timers, sensors, pots, consumables, plant agents …) with type, status, supply and maintenance data.",
  ),
  area(
    "list_equipment_lamps",
    "Lamps and their light",
    "Each lamp with its light zone, the manufacturer's statement, the measurements, the effective light and a zone check when a measurement deviates beyond the keeper's deviationLimit (percent).",
  ),
  area(
    "list_equipment_sensors",
    "Sensors and their place",
    "Each sensor with the specimen or location it sits at, plus the specimens and locations it could be placed at. No sensor values.",
  ),
  area(
    "list_equipment_agents",
    "Plant agents",
    "The plant agents with their supply (available, low, empty) and the treatment agent text each is linked to.",
  ),
  area(
    "list_equipment_zones",
    "Devices per light zone",
    "Per light zone its lamps, the specimen count and a note with the next step (no active lamp, unused capacity); lamps without a zone in unassigned.",
  ),
  area(
    "list_equipment_needs",
    "What is missing",
    "The equipment needs the app derives (supply running low, a zone or a wish's zone without an active lamp, a broken device without replacement), each with reason, source and next step.",
  ),
  area(
    "list_equipment_checks_due",
    "Checks due",
    "The active devices whose check interval has passed by the keeper's local date, most overdue first; overdueDays null means never checked.",
  ),
  area("list_equipment_wishes", "Equipment wishes", "The keeper's open equipment wishes."),
  area(
    "list_bought_equipment_wishes",
    "Bought equipment wishes",
    "The equipment wishes marked as bought.",
  ),
  area(
    "list_discarded_equipment_wishes",
    "Discarded equipment wishes",
    "The equipment wishes the keeper discarded; they are kept.",
  ),
];
