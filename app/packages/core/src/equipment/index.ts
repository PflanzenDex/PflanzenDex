// Public interface of the module `equipment` (ADR 0003): equipment records (US-EQU-01), lamps in light zones (US-EQU-02).
export { equipmentRecord } from "./record";
export type { RecordEquipmentDependencies } from "./record";
export { equipmentChecksDue, equipmentMarkChecked, equipmentSetMaintenance } from "./maintenance";
export type { CheckDue, ChecksDueDependencies } from "./maintenance";
export { equipmentLinkAgent, equipmentSetSupply, plantAgents } from "./supply";
export type { PlantAgent, PlantAgentsDependencies } from "./supply";
export { equipmentAssignSensor, sensorAssignments } from "./sensors";
export type { SensorAssignment, SensorAssignmentsDependencies, SensorView } from "./sensors";
export { equipmentNeeds } from "./needs";
export type { Need, NeedKind, NeedsDependencies } from "./needs";
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
export {
  equipmentWishBuy,
  equipmentWishCreate,
  equipmentWishDiscard,
  equipmentWishes,
} from "./wishes";
export type {
  EquipmentPrefill,
  EquipmentWishBuyResult,
  EquipmentWishChange,
  EquipmentWishDependencies,
  EquipmentWishList,
  EquipmentWishRow,
  EquipmentWishStore,
  EquipmentWishValues,
} from "./wishes";
export { equipmentCosts } from "./costs";
export type { CostLine, CostView } from "./costs";
