import type { HintOccasion } from "@pflanzendex/core";

/** The hint texts (US-ONB-07): at most `HINT_MAX_WORDS` words, a plain fact and the next step, no pressure (FR-ONB-08). */
export const HINT_TEXTS: Record<HintOccasion, string> = {
  first_plant_saved: "Deine erste Pflanze ist da. Miss sie, dann siehst du ihr Wachstum.",
  plant_without_place: "Diese Pflanze hat noch keinen Standort. Du kannst ihn jederzeit setzen.",
  first_measurement: "Du kannst jetzt messen: Foto und Größe zeigen, wie sie wächst.",
  function_unlocked: "Eine neue Funktion ist offen. Alles steht unter „Was die App kann“.",
};
