// Public interface of the module `equipment` (ADR 0003): equipment records (US-EQU-01), lamps in light zones (US-EQU-02).
export { equipmentRecord } from "./record";
export type { RecordEquipmentDependencies } from "./record";
export { equipmentSetStatus } from "./status";
export type { SetStatusDependencies } from "./status";
export {
  equipmentDescribeLamp,
  equipmentMeasure,
  equipmentSetDeviationLimit,
  equipmentSetZone,
  equipmentZoneUsage,
  lampLight,
  zoneEquipment,
} from "./lamps";
export type {
  DeviationLimitStore,
  Lamp,
  LampLight,
  LampLightDependencies,
  LampLightView,
  LampMeasurement,
  LampMeasurementStore,
  LampMeasurementValues,
  ZoneCheck,
  SetZoneDependencies,
  ZoneEquipment,
  ZoneEquipmentDependencies,
  ZoneEquipmentView,
  ZoneNote,
} from "./lamps";
export * from "./store";
