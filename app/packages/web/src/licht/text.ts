import type { Ableitung, ApiFehler, LichtStandort, Lichtzone, ZonenNutzer } from "./licht-api";

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
  lichtbedarfLux: "Lux-Bedarf",
  standardStufe: "Standard-Stufe",
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

const GRUND: Record<string, string> = {
  standard:
    "Die Art bleibt bei ihrer Standard-Stufe: die nächste Zone wäre mehr Licht als sie braucht (mehr Licht bringt Stress).",
  hochgestuft:
    "Der Lux-Bedarf erreicht mindestens 80 % der Lux-Decke der Stufe darunter und liegt nicht mehr als 30 % unter der Decke dieser Zone.",
  bedarf_zu_niedrig_fuer_hoehere_zone:
    "Die nächste Zone wäre mehr Licht als die Art braucht (mehr Licht bringt Stress). Sie bleibt hier.",
  weiches_blatt:
    "Weichblättrige C3-Pflanzen werden nicht automatisch in eine stärkere Zone eingestuft. Sie bleibt bei der Standard-Stufe.",
  oberste_zone: "Das ist die höchste Zone deines Kontos.",
  kein_bedarf:
    "Für diese Art ist kein Lux-Bedarf bekannt. Trage ihn im Katalog ein, dann wird die Zone abgeleitet.",
  keine_erwachsenenzone:
    "Du hast keine Zone für erwachsene Pflanzen. Lege eine zweite Lichtzone an (die erste ist Stecklingslicht).",
};

export const ableitungText = (a: Ableitung): { titel: string; grund: string } => ({
  titel: a.art === "zone" ? `Lichtzone: ${a.zone.name}` : "Lichtzone: unbekannt",
  grund: GRUND[a.grund] ?? "",
});
