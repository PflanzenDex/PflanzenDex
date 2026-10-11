// German texts of the equipment errors (epic EQU), kept apart so `error.ts` stays under the file size limit.
export const EQUIPMENT_ERROR_TEXTS = {
  "equipment.name_taken": "Dieses Equipment gibt es schon. Hänge „ – Regal 2“ o. Ä. an den Namen.",
  "equipment.not_found": "Dieses Equipment gibt es nicht. Lade die Liste neu.",
  "equipment.not_a_lamp":
    "Nur eine Lampe gehört zu einer Lichtzone. Dieses Equipment ist keine Lampe; es wurde nichts geändert.",
  "equipment.not_a_device":
    "Verbrauchsmaterial ist kein Gerät und hat keine Betriebsdaten oder Prüfungen. Es wurde nichts geändert.",
  "equipment.not_a_consumable":
    "Nur Verbrauchsmaterial hat einen Vorrat. Dieses Equipment ist ein Gerät; es wurde nichts geändert.",
  "equipment.not_a_plant_agent":
    "Nur ein Pflanzenmittel lässt sich mit dem Mittel einer Behandlung verknüpfen. Es wurde nichts geändert.",
  "equipment.no_status": "Verbrauchsmaterial hat keinen Betriebszustand. Es wurde nichts geändert.",
} as const;
