// German texts of the achievement errors (epic ACH) and of the leaf log (US-WAC-07). They also carry the equipment texts,
// so `error.ts` stays under the file size limit with one spread.
import { EQUIPMENT_ERROR_TEXTS } from "./equipment";

const LEAF_ERROR_TEXTS = {
  "leaf.date_in_future":
    "Das Datum des Blatts liegt in der Zukunft. Wähle heute oder ein früheres Datum.",
  "leaf.size_invalid":
    "Die Größe muss eine ganze Zahl in Millimetern von 1 bis 5.000 sein. Lass das Feld leer, wenn du nichts messen willst; es wurde nichts gespeichert.",
  "leaf.note_invalid":
    "Die Notiz darf höchstens 500 Zeichen lang sein und nicht leer sein. Es wurde nichts gespeichert.",
  "leaf.not_found": "Dieses Blatt gibt es nicht. Lade die Liste neu; es wurde nichts geändert.",
} as const;

export const ACHIEVEMENT_ERROR_TEXTS = {
  ...EQUIPMENT_ERROR_TEXTS,
  ...LEAF_ERROR_TEXTS,
  "achievements.not_earned":
    "Diesen Erfolg hast du noch nicht erreicht und kannst ihn deshalb nicht als gesehen vermerken. Lade die Erfolge neu; es wurde nichts geändert.",
  "achievements.pause_too_long":
    "Eine Pause im Pflegerhythmus dauert höchstens 4 Wochen. Trage eine kürzere Pause ein oder teile sie auf; es wurde nichts gespeichert.",
  "achievements.pause_not_found":
    "Diese Pause gibt es nicht (mehr). Lade den Pflegerhythmus neu; es wurde nichts geändert.",
} as const;
