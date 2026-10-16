// German texts of the achievement errors (epic ACH). They also carry the equipment texts, so `error.ts` stays under the
// file size limit with one spread.
import { EQUIPMENT_ERROR_TEXTS } from "./equipment";

export const ACHIEVEMENT_ERROR_TEXTS = {
  ...EQUIPMENT_ERROR_TEXTS,
  "achievements.not_earned":
    "Diesen Erfolg hast du noch nicht erreicht und kannst ihn deshalb nicht als gesehen vermerken. Lade die Erfolge neu; es wurde nichts geändert.",
} as const;
