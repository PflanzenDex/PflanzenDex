// German texts of the equipment errors (epic EQU) and the location errors (US-ONB-02), kept apart so `error.ts` stays under the file size limit.
import { CORRECTION_ERROR_TEXTS } from "./catalog";

export const EQUIPMENT_ERROR_TEXTS = {
  ...CORRECTION_ERROR_TEXTS,
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
  "equipment.not_a_sensor":
    "Nur ein Sensor wird einer Pflanze oder einem Standort zugeordnet. Dieses Equipment ist kein Sensor; es wurde nichts geändert.",
  "equipment.target_unknown":
    "Diese Pflanze oder diesen Standort gibt es nicht. Lade die Auswahl neu.",
  "equipment.no_status": "Verbrauchsmaterial hat keinen Betriebszustand. Es wurde nichts geändert.",
  "location.in_use":
    "Dieser Standort wird noch genutzt (Pflanzen, Pflegeprofile oder Sensoren) und kann nicht gelöscht werden. Ordne sie zuerst einem anderen Standort zu.",
  "location.not_empty":
    "Du hast schon Standorte. Die Voreinstellung ist nur für ein Konto ohne Standorte.",
} as const;
