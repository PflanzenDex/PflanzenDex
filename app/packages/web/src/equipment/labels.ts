import type { EquipmentStatus, EquipmentType, SupplyLevel } from "@pflanzendex/core";

/** The German names of the equipment types (DM-EQU-01); the codes stay English. */
export const TYPE_LABELS: Record<EquipmentType, string> = {
  Lamp: "Lampe",
  Timer: "Zeitschaltuhr",
  Sensor: "Sensor",
  Ventilation: "Lüftung",
  Pump: "Pumpe",
  Pot: "Topf",
  Substrate: "Substrat",
  Fertilizer: "Dünger",
  "Plant agent": "Pflanzenmittel",
  Other: "Sonstiges",
};

/** The types the code branches on, compared as values (FR-QG-12): a lamp has a light zone, a pot a size (DM-EQU-01, DM-EQU-05). */
export const LAMP_TYPE = "Lamp" as const;
export const POT_TYPE = "Pot" as const;

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  active: "Aktiv",
  defective: "Defekt",
  retired: "Ausgemustert",
};

/** The German names of the supply levels of a consumable (DM-EQU-03). */
export const SUPPLY_LABELS: Record<SupplyLevel, string> = {
  available: "Vorhanden",
  low: "Wird knapp",
  empty: "Leer",
};
