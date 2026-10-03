import { ganzzahlFeld, kennungFeld, objekt, oderNull, textFeld, wahlFeld } from "../kern";
import { GRENZEN, STANDORT_ARTEN } from "./typen";

const zonenFelder = {
  name: textFeld("name", GRENZEN.name),
  luxDecke: ganzzahlFeld("luxDecke", GRENZEN.luxDecke),
  ppfd: oderNull(ganzzahlFeld("ppfd", GRENZEN.ppfd)),
  reihenfolge: oderNull(ganzzahlFeld("reihenfolge", GRENZEN.reihenfolge)),
};
export const zonenSchema = objekt(zonenFelder);
export const zonenAenderSchema = objekt({ id: kennungFeld("id"), ...zonenFelder });
export const zonenKennungSchema = objekt({ id: kennungFeld("id") });

const standortFelder = {
  name: textFeld("name", GRENZEN.name),
  lichtzoneId: oderNull(kennungFeld("lichtzoneId")),
  art: wahlFeld("art", STANDORT_ARTEN),
};
export const standortSchema = objekt(standortFelder);
export const standortAenderSchema = objekt({ id: kennungFeld("id"), ...standortFelder });
