import type {
  LichtStandort,
  MessungZeile,
  Pflegephase,
  Qualitaet,
  Wachstumsmass,
} from "@pflanzendex/core";

/** P-08: Was fehlt, heißt „unbekannt“ und wird nie mit einem Wert gefüllt. */
export const UNBEKANNT = "unbekannt";

export const MASS_NAME: Record<Wachstumsmass, string> = {
  hoehe: "Höhe",
  rosettendurchmesser: "Rosettendurchmesser",
  trieblaenge: "Trieblänge",
};

export const massName = (m: Wachstumsmass | null): string => (m ? MASS_NAME[m] : UNBEKANNT);

export const QUALITAET_NAME: Record<Qualitaet, string> = {
  gesund: "Gesund",
  vergeilt: "Vergeilt/dünn",
};

/** `JJJJ-MM-TT` als „03.10.2026“ (ohne Zeitzonenumrechnung: es ist ein Kalenderdatum, NFR-08). */
export function datumText(iso: string): string {
  const [jahr, monat, tag] = iso.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/** „12,5 cm“: die Maße der Arten werden in Zentimetern gemessen (US-WAC-01). */
export const wertText = (wert: number): string =>
  `${wert.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;

export const messungText = (m: MessungZeile): string =>
  `${wertText(m.wert)} am ${datumText(m.datum)}`;

export const PHASENTEXT: Record<Pflegephase, string> = {
  ruhe: "Ruhephase",
  wachstum: "Wachstumsphase",
};

export const standortText = (standorte: readonly LichtStandort[], id: string | null): string =>
  id === null ? UNBEKANNT : (standorte.find((s) => s.id === id)?.name ?? UNBEKANNT);
