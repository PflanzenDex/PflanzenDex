// Equipment (US-EQU-01, DM-EQU-01). Ports for persistence; adapters live in `db` (AB-1).

export const EQUIPMENT_TYPES = [
  "Lamp",
  "Timer",
  "Sensor",
  "Ventilation",
  "Pump",
  "Pot",
  "Substrate",
  "Fertilizer",
  "Plant agent",
  "Other",
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

/** Consumables are used up; they have no operating status (DM-EQU-01: `Status` is not used for them). */
export const CONSUMABLE_TYPES: readonly EquipmentType[] = [
  "Substrate",
  "Fertilizer",
  "Plant agent",
];

export const EQUIPMENT_STATUSES = ["active", "defective", "retired"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

/** Limits are assumptions (starting values). */
export const EQUIPMENT_LIMITS = {
  name: { min: 1, max: 80 },
  manufacturer: { min: 1, max: 80 },
  model: { min: 1, max: 80 },
  productId: { min: 1, max: 60 },
  note: { min: 1, max: 500 },
  priceEur: { min: 0, max: 100_000 },
} as const;

export interface EquipmentValues {
  readonly type: EquipmentType;
  readonly name: string;
  readonly manufacturer: string | null;
  readonly model: string | null;
  /** GTIN/EAN or manufacturer plus model; never a URL (FR-EQU-03). */
  readonly productId: string | null;
  readonly priceEur: number | null;
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
  readonly boughtAt: string | null;
  readonly note: string | null;
  /** The light zone of a lamp (DM-EQU-02, US-EQU-02); `null` for every other type. */
  readonly lightZoneId: string | null;
}

/** Limits of the lamp data (US-EQU-03, DM-EQU-02); assumptions (starting values). */
export const LAMP_LIMITS = {
  powerW: { min: 1, max: 10_000 },
  lux: { min: 1, max: 200_000 },
  distanceCm: { min: 1, max: 1_000 },
  method: { min: 1, max: 60 },
  /** The share of the zone ceiling a measurement may deviate before "Check zone" appears, in percent. */
  deviationPercent: { min: 1, max: 100 },
} as const;

/** Limits of the operation and maintenance data (US-EQU-04); assumptions (starting values). */
export const MAINTENANCE_LIMITS = {
  /** How often a device is checked, in days (up to ten years). */
  intervalDays: { min: 1, max: 3_650 },
  lifetimeValue: { min: 1, max: 80 },
  lifetimeSource: { min: 1, max: 80 },
} as const;

/** What the keeper says about the operation of a device (DM-EQU-01, DM-EQU-02); `null` is unknown, never a guess (P-08). */
export interface MaintenanceData {
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
  readonly inOperationSince: string | null;
  readonly checkIntervalDays: number | null;
  /** The manufacturer's statement about the lifetime, always together with its source. */
  readonly lifetimeValue: string | null;
  readonly lifetimeSource: string | null;
}

/** How much of a consumable is left (US-EQU-05). */
export const SUPPLY_LEVELS = ["available", "low", "empty"] as const;
export type SupplyLevel = (typeof SUPPLY_LEVELS)[number];

/** Limit of the link between a plant agent and the free text of a treatment (US-EQU-05); assumption (starting value). */
export const SUPPLY_LIMITS = { agentLink: { min: 1, max: 80 } } as const;

export interface EquipmentRow extends EquipmentValues, MaintenanceData {
  /** The supply of a consumable; `null` for a device. A new consumable starts `available` (US-EQU-05). */
  readonly supply: SupplyLevel | null;
  /** The text of a plant agent that occurs in `Treatment.Agent`; `null` = no link (DM-EQU-03). */
  readonly agentLink: string | null;
  /** Local calendar date `YYYY-MM-DD` of the last check the keeper confirmed; `null` = never (US-EQU-04). */
  readonly lastCheckedOn: string | null;
  readonly id: string;
  /** Power of a lamp in watt, as the manufacturer states it; `null` for unknown and for every other type. */
  readonly powerW: number | null;
  /** The manufacturer's light statement of a lamp in lux (not measured, FR-LIC-06); `null` for unknown. */
  readonly luxStatement: number | null;
  /** `null` for consumables. */
  readonly status: EquipmentStatus | null;
}

/** What a write on one record can answer besides the changed record. */
export type ChangeResult<R extends string> = EquipmentRow | "not_found" | R;

/** Every call applies only to the account `userId` (P-04); names are unique per account, case-insensitive. */
export interface EquipmentStore {
  list(userId: string): Promise<readonly EquipmentRow[]>;
  create(
    userId: string,
    values: EquipmentValues,
    status: EquipmentStatus | null,
  ): Promise<EquipmentRow | "name_taken" | "zone_unknown">;
  /** Moves a lamp to another light zone of the same account (a foreign zone looks unknown, P-04). */
  setZone(
    userId: string,
    id: string,
    lightZoneId: string,
  ): Promise<ChangeResult<"not_lamp" | "zone_unknown">>;
  /** Sets the state of a device; a consumable has none. */
  setStatus(
    userId: string,
    id: string,
    status: EquipmentStatus,
  ): Promise<ChangeResult<"no_status">>;
  /** Sets what the manufacturer states about a lamp; `null` clears a value back to unknown. */
  setLampData(
    userId: string,
    id: string,
    data: { powerW: number | null; luxStatement: number | null },
  ): Promise<ChangeResult<"not_lamp">>;
  /** Sets the operation and maintenance data of a device; only a device has them, a consumable does not. */
  setMaintenance(
    userId: string,
    id: string,
    data: MaintenanceData,
  ): Promise<ChangeResult<"consumable">>;
  /** Sets the supply of a consumable (US-EQU-05). */
  setSupply(
    userId: string,
    id: string,
    supply: SupplyLevel,
  ): Promise<ChangeResult<"not_consumable">>;
  /** Links a plant agent to the text of `Treatment.Agent`; `null` removes the link. */
  setAgentLink(
    userId: string,
    id: string,
    agentLink: string | null,
  ): Promise<ChangeResult<"not_plant_agent">>;
  /** Notes that the keeper checked a device on this date. */
  markChecked(userId: string, id: string, checkedOn: string): Promise<ChangeResult<"consumable">>;
  /** The lamps that serve a light zone, by name, whatever their state. */
  usingZone(userId: string, lightZoneId: string): Promise<readonly EquipmentRow[]>;
}
