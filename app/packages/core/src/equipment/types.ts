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
}

export interface EquipmentRow extends EquipmentValues {
  readonly id: string;
  /** `null` for consumables. */
  readonly status: EquipmentStatus | null;
}

/** Every call applies only to the account `userId` (P-04); names are unique per account, case-insensitive. */
export interface EquipmentStore {
  list(userId: string): Promise<readonly EquipmentRow[]>;
  create(
    userId: string,
    values: EquipmentValues,
    status: EquipmentStatus | null,
  ): Promise<EquipmentRow | "name_taken">;
}
