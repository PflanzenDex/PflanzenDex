import type { EquipmentStatus, EquipmentType } from "@pflanzendex/core";

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

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  active: "Aktiv",
  defective: "Defekt",
  retired: "Ausgemustert",
};
