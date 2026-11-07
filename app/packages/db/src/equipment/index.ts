// Public interface of the module `equipment` (ADR 0003).
export { EquipmentPostgres } from "./equipment.ts";
export {
  PotPlacementPostgres,
  type PotRecord,
  type PlacementResult,
  type PlaceRefusal,
} from "./pot-placement.ts";
export { PotRepotPostgres } from "./pot-repot-unit.ts";
export { FIXTURES_EQUIPMENT } from "./fixtures.ts";
export { LampMeasurementsPostgres } from "./lamps/measurements.ts";
export { DeviationLimitPostgres } from "./lamps/settings.ts";
export { EquipmentSharingPostgres } from "./sharing/equipment-sharing.ts";
