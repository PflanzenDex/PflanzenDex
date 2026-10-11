// Public interface of the module `equipment` (ADR 0003): equipment records (US-EQU-01).
export { equipmentRecord } from "./record";
export type { RecordEquipmentDependencies } from "./record";
export { CONSUMABLE_TYPES, EQUIPMENT_LIMITS, EQUIPMENT_STATUSES, EQUIPMENT_TYPES } from "./types";
export type {
  EquipmentRow,
  EquipmentStatus,
  EquipmentStore,
  EquipmentType,
  EquipmentValues,
} from "./types";
