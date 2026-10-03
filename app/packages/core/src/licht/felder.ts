import { ganzzahlFeld, kennungFeld, objekt, textFeld, wahlFeld, type Fehlerdetail } from "../kern";
import { GRENZEN, STANDORT_ARTEN } from "./typen";

/** Fehlt der Wert (undefined oder null), ist er „nicht angegeben“ (null). */
export function oderNull<T>(pruefe: (wert: unknown) => T | Fehlerdetail) {
  return (wert: unknown): T | Fehlerdetail | null =>
    wert === undefined || wert === null ? null : pruefe(wert);
}

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
