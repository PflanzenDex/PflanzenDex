import type { ApiFehler, LichtStandort, Lichtzone, ZonenNutzer } from "./licht-api";

const zahl = new Intl.NumberFormat("de-DE");

export const lux = (n: number) => `${zahl.format(n)} Lux`;
export const ppfd = (n: number | null) =>
  n === null ? "PPFD unbekannt" : `PPFD ${zahl.format(n)} µmol/m²/s`;
export const artText = (a: LichtStandort["art"]) => (a === "innen" ? "innen" : "außen");

export const zonenName = (zonen: readonly Lichtzone[], id: string | null): string | null =>
  id === null ? null : (zonen.find((z) => z.id === id)?.name ?? null);

const FELDER: Record<string, string> = {
  name: "Name",
  luxDecke: "Lux-Decke",
  ppfd: "PPFD",
  reihenfolge: "Reihenfolge",
  art: "Art",
  lichtzoneId: "Lichtzone",
};
const NUTZER_ART: Record<ZonenNutzer["art"], string> = {
  standort: "Standort",
  exemplar: "Exemplar",
  art: "Art",
};

export const nutzerText = (n: ZonenNutzer) => `${NUTZER_ART[n.art]}: ${n.name}`;

/** Felder, die der Server beanstandet hat, in Worten der Oberfläche. */
export function feldNamen(f: ApiFehler): string[] {
  return (f.details ?? []).map((d) => FELDER[d.feld] ?? d.feld);
}
