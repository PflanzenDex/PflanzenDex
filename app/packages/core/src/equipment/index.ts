// Public interface of the module `equipment` (ADR 0003): equipment records (US-EQU-01), lamps in light zones (US-EQU-02).
export { equipmentRecord } from "./record";
export type { RecordEquipmentDependencies } from "./record";
export { equipmentSetStatus } from "./status";
export type { SetStatusDependencies } from "./status";
export { equipmentSetZone, equipmentZoneUsage, zoneEquipment } from "./lamps";
export type {
  Lamp,
  SetZoneDependencies,
  ZoneEquipment,
  ZoneEquipmentDependencies,
  ZoneEquipmentView,
  ZoneNote,
} from "./lamps";
export * from "./store";
