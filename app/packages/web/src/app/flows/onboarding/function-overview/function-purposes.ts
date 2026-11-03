// One sentence per function: what it is for (US-ONB-06). Kept next to the overview, so these texts load with its own
// chunk and not with the initial bundle (DS-08). German UI texts; the keys are the registry ids.
import type { UnlockFunctionId } from "@pflanzendex/core";

export const FUNCTION_PURPOSES: Record<UnlockFunctionId, string> = {
  today: "Zeigt, was heute bei deinen Pflanzen ansteht.",
  collection: "Hier liegen alle deine Pflanzen, Stecklinge und Wünsche.",
  species_catalog: "Der gemeinsame Katalog aller Arten zum Nachschlagen.",
  light_zones: "Lege Standorte und Lichtzonen an und ordne deine Pflanzen zu.",
  measuring: "Halte Maße deiner Pflanzen fest, um ihr Wachstum zu verfolgen.",
  photos: "Hänge Fotos an deine Pflanzen und sieh, wie sie sich verändern.",
  growth: "Zeigt den Verlauf deiner Pflanzen anhand deiner eigenen Messungen.",
  treatments: "Plane Behandlungen und hake sie ab, wenn sie erledigt sind.",
  pokedex: "Zeigt, welche Arten du schon hast, und was dir noch fehlt.",
  wishlist: "Merke dir Arten, die du gern hättest.",
  discover: "Schlägt dir Arten aus dem Katalog vor, die du auf die Wunschliste legen kannst.",
  equipment: "Verwalte deine Ausrüstung und sieh, wann etwas nachgekauft werden sollte.",
  friends: "Lade Freunde ein und sieh, was sie dir freigegeben haben.",
  swapping: "Tausche Pflanzen und Stecklinge mit deinen Freunden.",
  ai_access: "Gib einem KI-Assistenten Zugang, der mit deinen Daten arbeiten darf.",
  care_rhythm: "Zeigt deinen Pflegerhythmus ohne Druck und ohne Vergleich mit anderen.",
  anniversaries: "Erinnert an Jahrestage, an denen eine Pflanze zu dir gekommen ist.",
  year_in_review: "Ein Rückblick auf dein Pflanzenjahr aus deinen eigenen Daten.",
};
